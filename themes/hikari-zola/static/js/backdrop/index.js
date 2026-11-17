/**
 * backdrop/index.js — mount controller for the hologram railgun.
 * data-variant hero|ambient|off, data-density auto|low|high|<n>, and (hero)
 * data-hk-anchor=<selector>: the gun is projected into that rect, which is
 * re-read every frame so the gun stays glued to the booth while scrolling.
 * Drag the booth to spin it: horizontal = yaw, vertical = pitch (±10°), with
 * inertia; ~1.2 s after release the slow auto spin eases back in. Failures hide
 * the canvas silently. reduced-motion: manual drag only (one frame per input);
 * rAF stops on hidden tabs / off-screen anchor; saveData / deviceMemory<=4 halve.
 */
import { buildRailgun } from './railgun.js?v=202611171733';
import { createRenderer } from './gl.js?v=202611171733';

const DEG = Math.PI / 180;
const PITCH = 16 * DEG;          // base tilt
const ROLL = 24 * DEG;           // booth tilt (turntable, not a slanted stick)
const PR = 10 * DEG;             // drag pitch range
const DPX = 0.6 * DEG;           // yaw per dragged px
const PPX = 0.5 * DEG;           // pitch per dragged px
const SPIN = 0.11;               // auto rotation, rad/s
const IDLE = 1200;               // ms without input before the auto spin returns
const REST_YAW = 28 * DEG;       // start / reduced-motion pose
const BOB = 0.9;                 // vertical float, rad/s
const DPR_CAP = 2;
const DESKTOP_AREA = 1296000;    // 1440x900 = full budget
const MAX_POINTS = 16000;
const MIN_POINTS = 5600;

const reduceMQ = () => matchMedia('(prefers-reduced-motion: reduce)');
const darkMQ = () => matchMedia('(prefers-color-scheme: dark)');

/** effective theme: explicit html[data-theme] wins, else the OS preference */
function isDark() {
  const t = document.documentElement.dataset.theme;
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return darkMQ().matches;
}

/** data-saver / low-end device (contract: halve or disable) */
function lowPower() {
  const c = navigator.connection;
  const mem = navigator.deviceMemory;
  return Boolean((c && c.saveData) || (typeof mem === 'number' && mem <= 4));
}

/** point budget from viewport area, DPR and the container's data-density */
function pointCount(el) {
  const area = Math.max(1, innerWidth * innerHeight);
  let n = MAX_POINTS * Math.min(1, Math.max(MIN_POINTS / MAX_POINTS, area / DESKTOP_AREA));
  const mode = String(el.dataset.density || 'auto').toLowerCase();
  if (/^\d+$/.test(mode)) n = +mode;
  else if (mode === 'low' || mode === 'half') n *= 0.5;
  else if (mode === 'high' || mode === 'full') n = MAX_POINTS;
  if ((window.devicePixelRatio || 1) > 1.75) n *= 0.9;
  if (lowPower()) n *= 0.5;
  return Math.round(Math.min(MAX_POINTS, Math.max(2000, n)));
}

/** find (or create) the canvas; keeps it inert */
function prepare(el) {
  let canvas = el.querySelector('canvas.hk-backdrop__canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'hk-backdrop__canvas';
    el.appendChild(canvas);
  }
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.pointerEvents = 'none';
  return canvas;
}

/** Mount on one container (idempotent); null when off / no WebGL2. */
export function mountBackdrop(el, opts = {}) {
  if (!el) return null;
  if (el.__hkBackdrop) return el.__hkBackdrop;
  const get = (k, d) => opts[k] !== undefined ? opts[k] : el.dataset[k] !== undefined ? el.dataset[k] : d;

  const variant = String(get('variant', 'ambient')).toLowerCase();
  if (variant === 'off') { el.style.display = 'none'; return null; }

  const canvas = prepare(el);
  canvas.style.display = 'none';        // shown only after a correctly sized draw
  // ambient must be dimmed (0.25) unless the CSS already did
  if (variant === 'ambient'
      && parseFloat(getComputedStyle(el).opacity) * parseFloat(getComputedStyle(canvas).opacity) >= 1) {
    canvas.style.opacity = '0.25';
  }
  const reduced = reduceMQ().matches;
  const t0 = performance.now();

  // anchor: the attribute value is a CSS selector (hero only)
  let anchor = null;
  const sel = el.dataset.hkAnchor;
  if (sel) {
    try { anchor = document.querySelector(sel.trim()); } catch (e) { anchor = null; }
  }

  const ctrl = { variant, count: 0, stats: { buildMs: 0, firstFrameMs: 0 }, destroy: () => {} };
  el.__hkBackdrop = ctrl;

  let renderer = null;
  const makeRenderer = () => {
    try { return createRenderer(canvas); } catch (e) { return null; }
  };
  renderer = makeRenderer();
  if (!renderer) {
    setTimeout(() => {
      renderer = makeRenderer();
      if (renderer) boot();
      else canvas.style.display = 'none';
    }, 500);
    return ctrl;
  }

    boot();
  return ctrl;

  function boot() {
  const st = {
    yaw: REST_YAW, pitchD: 0, vel: SPIN,
    w: 0, h: 0, dpr: 0, last: 0, raf: 0, running: false, warned: 0,
    fitW: 0, fitH: 0, gunOn: true, idle: 0, ready: false, bad: 0,
  };
  let drag = null;

  /** projection box in CSS px; the anchor rect is re-read on every call */
  const box = () => {
    const vw = st.w || innerWidth, vh = st.h || innerHeight;
    if (anchor) {
      const r = anchor.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return null;        // layout not settled: retry
      return { cx: r.left + r.width * 0.5, cy: r.top + r.height * 0.46, w: r.width, h: r.height,
        on: r.bottom > -160 && r.top < vh + 160 };
    }
    return variant === 'ambient'
      ? { cx: vw * 0.58, cy: vh * 0.52, w: vw * 0.55, h: vh * 0.55, on: true }
      : { cx: vw * 0.7, cy: vh * 0.5, w: vw * 0.46, h: vh * 0.62, on: true };
  };

  /** refit only when the booth *size* changes; otherwise just move the centre */
  const place = () => {
    const vw = st.w || innerWidth, vh = st.h || innerHeight;
    const b = box();
    if (!b) return false;
    st.ready = true;
    const cx = (2 * b.cx) / vw - 1, cy = 1 - (2 * b.cy) / vh;
    const bw = (2 * b.w) / vw, bh = (2 * b.h) / vh;
    if (Math.abs(bw - st.fitW) > 0.002 || Math.abs(bh - st.fitH) > 0.002) {
      st.fitW = bw; st.fitH = bh;
      renderer.setFit({ cx, cy, w: bw, h: bh, roll: ROLL, p0: PITCH - PR, p1: PITCH + PR });
    } else {
      renderer.setCenter(cx, cy);
    }
    st.gunOn = b.on;
    return true;
  };

  const draw = (now, first) => {
    sizeTo();                                  // self-heal the drawing buffer
    if (!st.w || !place()) return;             // per-frame: glued to the booth
    const t = now / 1000;
    const dt = st.last ? Math.min(0.05, t - st.last) : 0.016;
    st.last = t;
    if (!reduced && !drag) {
      if (now - st.idle > IDLE) st.vel += (SPIN - st.vel) * Math.min(1, dt * 2.2);
      else st.vel *= Math.pow(0.92, dt * 60);
      st.yaw += st.vel * dt;
    }
    renderer.draw({
      time: reduced ? 0 : t,
      dark: isDark(),
      yaw: st.yaw,
      pitch: PITCH + st.pitchD,
      roll: ROLL,
      bob: reduced ? 0 : Math.sin(t * BOB) * 0.0075 * (st.fitH || 1),
      dim: st.w < 560 ? 0.85 : 1,
      breathe: !reduced,
    });
    canvas.style.display = 'block';            // first good frame → visible
    if (!ctrl.stats.firstFrameMs) ctrl.stats.firstFrameMs = performance.now() - t0;
  };

  const build = () => {
    const t = performance.now();
    const count = pointCount(el);
    const geo = buildRailgun(count);
    renderer.setPoints(geo.data, geo.hull);
    ctrl.count = count;
    ctrl.stats.buildMs = performance.now() - t;
  };

  /** enforce canvas.width/height = viewport × dpr; true when it changed */
  const sizeTo = () => {
    const w = Math.max(1, el.clientWidth || innerWidth);
    const h = Math.max(1, el.clientHeight || innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, lowPower() ? 1.5 : DPR_CAP);
    const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
    if (w === st.w && h === st.h && dpr === st.dpr && canvas.width === bw && canvas.height === bh) return false;
    st.w = w; st.h = h; st.dpr = dpr;
    st.fitW = st.fitH = 0;                     // force a refit at the new size
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    renderer.resize(w, h, dpr);
    const want = pointCount(el);
    if (!ctrl.count || Math.abs(want - ctrl.count) / ctrl.count > 0.2) build();
    return true;
  };

  const resize = () => {
    sizeTo();
    place();
    if (reduced || !st.running) draw(performance.now(), !ctrl.stats.firstFrameMs);
  };

  const frame = (now) => {
    if (!st.running) return;
    st.raf = requestAnimationFrame(frame);
    try { draw(now, false); st.bad = 0; } catch (e) {
      if (!st.warned) { st.warned = 1; try { console.warn('[backdrop]', e); } catch (_) {} }
      if (++st.bad > 10) {                       // never leave the canvas dead
        st.bad = 0; stop();
        setTimeout(() => { if (!ctrl.destroyed) { sizeTo(); resize(); sync(); } }, 400);
      }
    }
  };
  const start = () => {
    if (reduced || st.running) return;
    st.running = true;
    st.last = 0;
    try { draw(performance.now(), !ctrl.stats.firstFrameMs); } catch (e) {}
    st.raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    st.running = false;
    if (st.raf) cancelAnimationFrame(st.raf);
    st.raf = 0;
  };
  // live: a cached flag would latch "offscreen" once the loop stopped
  const visible = () => {
    if (document.hidden) return false;
    if (!anchor) return true;
    const r = anchor.getBoundingClientRect();
    return r.width > 4 && r.bottom > -160 && r.top < innerHeight + 160;
  };
  const sync = () => {
    if (reduced) { draw(performance.now(), !ctrl.stats.firstFrameMs); return; }
    if (visible()) start(); else stop();
  };
  /** retry (n × 100 ms) until the booth has a usable rect; keeps the page alive */
  const kick = (n) => {
    if (n <= 0 || ctrl.destroyed) return;
    setTimeout(() => {
      if (ctrl.destroyed) return;
      resize();
      if (place()) sync(); else kick(n - 1);
    }, 100);
  };

  /* drag to spin (on the anchor), plus scroll / resize / visibility */
  const endDrag = () => {
    if (!drag) return;
    drag = null;
    if (anchor) anchor.classList.remove('is-dragging');
    st.idle = performance.now();
    if (reduced) draw(performance.now(), false);
  };
  const onDown = (e) => {
    if (!anchor || (e.button !== undefined && e.button > 0)) return;
    drag = { x: e.clientX, y: e.clientY, yaw: st.yaw, pitch: st.pitchD, t: performance.now(), y0: st.yaw };
    st.vel = 0;
    st.idle = performance.now();
    anchor.classList.add('is-dragging');
    if (anchor.setPointerCapture) { try { anchor.setPointerCapture(e.pointerId); } catch (err) {} }
    if (e.pointerType === 'mouse' && e.preventDefault) e.preventDefault();   // no text select
    if (!reduced) start();
  };
  const onMove = (e) => {
    if (!drag) return;
    const now = performance.now();
    st.yaw = drag.yaw + (e.clientX - drag.x) * DPX;
    st.pitchD = Math.max(-PR, Math.min(PR, drag.pitch - (e.clientY - drag.y) * PPX));
    const dt = Math.max(8, now - drag.t) / 1000;
    st.vel = Math.max(-6, Math.min(6, (st.yaw - drag.y0) / dt));
    drag.y0 = st.yaw;
    drag.t = now;
    st.idle = now;
    if (reduced) draw(now, false);
  };
  const onScroll = () => {
    if (reduced) draw(performance.now(), false);   // no loop, keep it glued
    else sync();
  };
  const onTheme = () => { if (!st.running) draw(performance.now(), false); };
  const onVis = () => sync();

  if (anchor) {
    anchor.addEventListener('pointerdown', onDown);
    anchor.addEventListener('pointermove', onMove);
    anchor.addEventListener('pointerup', endDrag);
    anchor.addEventListener('pointercancel', endDrag);
  }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', resize);
  document.addEventListener('visibilitychange', onVis);

  // a lost context must not leave a silent empty booth
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); stop(); }, false);
  canvas.addEventListener('webglcontextrestored', () => {
    try { st.fitW = st.fitH = 0; build(); sizeTo(); resize(); sync(); } catch (err) {}
  }, false);

  // until a frame lands, keep forcing placement
  const watchdog = () => {
    if (ctrl.destroyed || ctrl.stats.firstFrameMs) return;
    try { sizeTo(); resize(); sync(); } catch (e) {}
    setTimeout(watchdog, 500);
  };
  const wd = setTimeout(watchdog, 1200);

  const mo = new MutationObserver(onTheme);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const mqDarkChange = darkMQ();
  if (mqDarkChange.addEventListener) mqDarkChange.addEventListener('change', onTheme);

  ctrl.destroy = () => {
    ctrl.destroyed = true;
    clearTimeout(wd);
    stop();
    if (ro) ro.disconnect();
    if (io) io.disconnect();
    mo.disconnect();
    if (mqDarkChange.removeEventListener) mqDarkChange.removeEventListener('change', onTheme);
    document.removeEventListener('visibilitychange', onVis);
    removeEventListener('scroll', onScroll);
    removeEventListener('resize', resize);
    if (anchor) {
      anchor.removeEventListener('pointerdown', onDown);
      anchor.removeEventListener('pointermove', onMove);
      anchor.removeEventListener('pointerup', endDrag);
      anchor.removeEventListener('pointercancel', endDrag);
      anchor.classList.remove('is-dragging');
    }
    renderer.dispose();
    el.__hkBackdrop = null;
    canvas.style.display = 'none';
  };

  resize();                       // sizes the canvas + renders the first frame
  sync();                         // start the loop unless reduced motion / offscreen
  kick(30);                       // up to ~3 s of retries while layout settles

  // late-layout hooks: fonts / load / first frames / booth resize all re-place
  addEventListener('load', () => { resize(); sync(); });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { resize(); sync(); }).catch(() => {});
  }
  let rafN = 0;
  const firstFrames = () => {
    if (ctrl.destroyed) return;
    resize();
    if (++rafN < 3) requestAnimationFrame(firstFrames);
  };
  requestAnimationFrame(firstFrames);
  let io = null;
  if (window.IntersectionObserver && anchor) {
    try { io = new IntersectionObserver(() => sync(), { rootMargin: '160px' }); io.observe(anchor); } catch (e) { io = null; }
  }
  addEventListener('pageshow', sync);

  let ro = null;
  if (window.ResizeObserver) {
    ro = new ResizeObserver(() => { resize(); sync(); });
    try { ro.observe(anchor || el); } catch (e) { ro = null; }
  }
  }
}

function autoMount() {
  document.querySelectorAll('[data-hk-backdrop]').forEach((el) => {
    try { mountBackdrop(el); } catch (e) { /* silent fallback */ }
  });
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoMount, { once: true });
} else {
  autoMount();
}

export default mountBackdrop;