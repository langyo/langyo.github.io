/**
 * backdrop/index.js — mount controller for the hologram railgun.
 * data-variant hero|ambient|off, data-density auto|low|high|<n>, data-parallax,
 * and (hero) data-hk-anchor=<selector>: the gun is projected into that rect;
 * without it it falls back to the viewport's right 70% / 62% height. Failures
 * hide the canvas silently. reduced-motion = one static frame (yaw 28°); rAF
 * stops on hidden tabs / off-screen anchor; saveData or deviceMemory<=4 halve.
 */
import { buildRailgun } from './railgun.js';
import { createRenderer } from './gl.js';

const DEG = Math.PI / 180;
const PITCH = 16 * DEG;         // fixed tilt (contract)
const ROLL = 40 * DEG;          // base tilt: gun rises left→right (screen roll -40°)

const SPIN = 0.12;              // rad/s, ~52 s per revolution
const REST_YAW = 28 * DEG;      // reduced-motion pose
const BOB = 0.9;                // vertical float, rad/s (~7 s period)
const PARALLAX = 5 * DEG;
const DPR_CAP = 2;
const DESKTOP_AREA = 1296000;   // 1440x900 = full budget
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
  // ambient must be dimmed (0.25) unless the CSS already did
  if (variant === 'ambient'
      && parseFloat(getComputedStyle(el).opacity) * parseFloat(getComputedStyle(canvas).opacity) >= 1) {
    canvas.style.opacity = '0.25';
  }
  const parallaxOn = String(get('parallax', 'true')) !== 'false';
  const reduced = reduceMQ().matches;
  const t0 = performance.now();

  // anchor: the attribute value is a CSS selector (hero only)
  let anchor = null;
  const sel = el.dataset.hkAnchor;
  if (sel) {
    try { anchor = document.querySelector(sel.trim()); } catch (e) { anchor = null; }
  }

  let renderer = null;
  try { renderer = createRenderer(canvas); } catch (e) { renderer = null; }
  if (!renderer) { canvas.style.display = 'none'; return null; }   // silent fallback

  const ctrl = { variant, count: 0, stats: { buildMs: 0, firstFrameMs: 0 }, destroy: null };
  el.__hkBackdrop = ctrl;

  const st = {
    yawP: 0, pitchP: 0, yawT: 0, pitchT: 0,   // pointer parallax, smoothed
    scroll: 0, scrollT: 0,                    // scroll parallax, smoothed
    w: 0, h: 0, dpr: 0, last: 0, raf: 0, running: false,
    fit: { cx: 0, cy: 0, w: 1, h: 1 }, gunOn: true,
  };

  /** projection box in CSS px: anchor rect, or the contract fallbacks */
  const box = () => {
    const vw = st.w || innerWidth, vh = st.h || innerHeight;
    if (anchor) {
      const r = anchor.getBoundingClientRect();
      if (r.width > 40 && r.height > 30) {
        return { cx: r.left + r.width * 0.5, cy: r.top + r.height * 0.46, w: r.width, h: r.height,
          on: r.bottom > -160 && r.top < vh + 160 };
      }
    }
    return variant === 'ambient'
      ? { cx: vw * 0.58, cy: vh * 0.52, w: vw * 0.55, h: vh * 0.55, on: true }
      : { cx: vw * 0.7, cy: vh * 0.5, w: vw * 0.46, h: vh * 0.62, on: true };
  };

  /** hand the projection box to the renderer in NDC; it fits the gun's bbox */
  const place = () => {
    const b = box();
    const vw = st.w || innerWidth, vh = st.h || innerHeight;
    st.fit = { cx: (2 * b.cx) / vw - 1, cy: 1 - (2 * b.cy) / vh, w: (2 * b.w) / vw, h: (2 * b.h) / vh };
    st.gunOn = b.on;
  };

  const draw = (now, first) => {
    const t = now / 1000;
    const dt = st.last ? Math.min(0.05, t - st.last) : 0.016;
    st.last = t;
    const k = Math.min(1, dt * 6);
    st.yawP += (st.yawT - st.yawP) * k;
    st.pitchP += (st.pitchT - st.pitchP) * k;
    st.scroll += (st.scrollT - st.scroll) * Math.min(1, dt * 8);
    renderer.draw({
      time: reduced ? 0 : t,
      dark: isDark(),
      yaw: (reduced ? REST_YAW : t * SPIN) + st.yawP,
      pitch: PITCH + st.pitchP,
      roll: ROLL,
      fit: st.fit,
      bob: reduced ? 0 : Math.sin(t * BOB) * 0.015 * st.fit.h + st.scroll,
      dim: st.w < 560 ? 0.85 : 1,
      breathe: !reduced,
    });
    if (first) ctrl.stats.firstFrameMs = performance.now() - t0;
  };

  const build = () => {
    const t = performance.now();
    const count = pointCount(el);
    const geo = buildRailgun(count);
    renderer.setPoints(geo.data, geo.hull);
    ctrl.count = count;
    ctrl.stats.buildMs = performance.now() - t;
  };

  const resize = () => {
    const w = Math.max(1, el.clientWidth || innerWidth);
    const h = Math.max(1, el.clientHeight || innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, lowPower() ? 1.5 : DPR_CAP);
    if (w === st.w && h === st.h && dpr === st.dpr) { place(); return; }
    st.w = w; st.h = h; st.dpr = dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    renderer.resize(w, h, dpr);
    const want = pointCount(el);
    if (!ctrl.count || Math.abs(want - ctrl.count) / ctrl.count > 0.2) build();
    place();
    if (reduced || !st.running) draw(performance.now(), !ctrl.stats.firstFrameMs);
  };

  const frame = (now) => {
    if (!st.running) return;
    st.raf = requestAnimationFrame(frame);
    try { draw(now, false); } catch (e) { stop(); canvas.style.display = 'none'; }
  };
  const start = () => {
    if (reduced || st.running) return;
    st.running = true;
    st.last = 0;
    st.raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    st.running = false;
    if (st.raf) cancelAnimationFrame(st.raf);
    st.raf = 0;
  };
  const sync = () => {
    if (reduced) { if (!ctrl.stats.firstFrameMs) draw(performance.now(), true); return; }
    if (st.gunOn && !document.hidden) start(); else stop();
  };

  /* input + lifecycle */
  const onPointer = (e) => {
    if (!parallaxOn || reduced) return;
    st.yawT = (e.clientX / Math.max(1, innerWidth) * 2 - 1) * PARALLAX;
    st.pitchT = (e.clientY / Math.max(1, innerHeight) * 2 - 1) * PARALLAX * 0.6;
  };
  let lastPlace = 0;
  const onScroll = () => {
    st.scrollT = -Math.min(1, (window.scrollY || 0) / Math.max(1, st.h)) * 0.035;
    const now = performance.now();
    if (now - lastPlace > 90) { lastPlace = now; place(); }   // throttle the rect read
    sync();
  };
  const onTheme = () => { if (!st.running) draw(performance.now(), false); };
  const onVis = () => sync();

  addEventListener('pointermove', onPointer, { passive: true });
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', resize);
  document.addEventListener('visibilitychange', onVis);

  const mo = new MutationObserver(onTheme);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const mqDarkChange = darkMQ();
  if (mqDarkChange.addEventListener) mqDarkChange.addEventListener('change', onTheme);

  ctrl.destroy = () => {
    stop();
    mo.disconnect();
    if (mqDarkChange.removeEventListener) mqDarkChange.removeEventListener('change', onTheme);
    document.removeEventListener('visibilitychange', onVis);
    removeEventListener('pointermove', onPointer);
    removeEventListener('scroll', onScroll);
    removeEventListener('resize', resize);
    renderer.dispose();
    el.__hkBackdrop = null;
    canvas.style.display = 'none';
  };

  resize();                       // sizes the canvas + renders the first frame
  sync();                         // start the loop unless reduced motion / offscreen
  return ctrl;
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
