/**
 * backdrop/index.js — mount controller for the WebGL2 "light sword" backdrop.
 * Containers come from partials/backdrop.html: data-variant hero|ambient|off,
 * data-density auto|low|high|<n>, data-parallax true|false. Any failure (no
 * WebGL2, bad shader) silently hides the canvas. prefers-reduced-motion draws
 * one static frame; rAF stops off-screen / hidden; saveData or deviceMemory<=4
 * halve the point budget.
 */
import { buildSword } from './sword.js';
import { createRenderer } from './gl.js';

const DEG = Math.PI / 180;
const TILT = 8 * DEG;          // 前倾 8°
const SWAY = 20 * DEG;         // ±20° controlled swing — never edge-on
const ROLL = 2 * DEG;          // ±2° screen-space roll "breathing"
const PARALLAX = 6 * DEG;      // pointer parallax range (±6°)
const DPR_CAP = 2;
const DESKTOP_AREA = 1296000;  // 1440×900 = full budget
const MAX_POINTS = 18000;
const MIN_POINTS = 6000;

const reduceMQ = () => matchMedia('(prefers-reduced-motion: reduce)');
const darkMQ = () => matchMedia('(prefers-color-scheme: dark)');

/** effective theme: explicit html[data-theme] wins, otherwise the OS preference */
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
  if ((window.devicePixelRatio || 1) > 1.75) n *= 0.9;  // denser DPR → slightly fewer
  if (lowPower()) n *= 0.5;
  return Math.round(Math.min(MAX_POINTS, Math.max(1200, n)));
}

/** keep the canvas full-bleed and inert even before/without the theme CSS */
function prepare(el) {
  let canvas = el.querySelector('canvas.hk-backdrop__canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'hk-backdrop__canvas';
    el.appendChild(canvas);
  }
  canvas.setAttribute('aria-hidden', 'true');
  if (getComputedStyle(el).position === 'static') {
    el.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden';
  }
  if (getComputedStyle(canvas).position === 'static') {
    Object.assign(canvas.style, { position: 'absolute', left: '0', top: '0' });
  }
  canvas.style.display = 'block';
  canvas.style.pointerEvents = 'none';
  return canvas;
}

/**
 * Mount on one container; idempotent, so a second call (main.js after the module
 * self-mounted) returns the existing controller.
 * @param {HTMLElement} el
 * @param {{variant?:string, density?:string, parallax?:boolean|string}} [opts]
 * @returns controller, or null when the backdrop is off or WebGL2 is unavailable
 */
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

  let renderer = null;
  try { renderer = createRenderer(canvas); } catch (e) { renderer = null; }
  if (!renderer) { canvas.style.display = 'none'; return null; }   // silent fallback

  const ctrl = { variant, count: 0, stats: { buildMs: 0, firstFrameMs: 0 }, destroy: null };
  el.__hkBackdrop = ctrl;

  const st = {
    yaw: 0, pitch: 0, yawT: 0, pitchT: 0,   // pointer parallax, smoothed
    scroll: 0, scrollT: 0,                  // scroll parallax, smoothed
    w: 0, h: 0, dpr: 0, last: 0, raf: 0, running: false, inView: true,
  };

  const draw = (now, first) => {
    const t = now / 1000;
    const dt = st.last ? Math.min(0.05, t - st.last) : 0.016;
    st.last = t;
    const k = Math.min(1, dt * 6);
    st.yaw += (st.yawT - st.yaw) * k;
    st.pitch += (st.pitchT - st.pitch) * k;
    st.scroll += (st.scrollT - st.scroll) * Math.min(1, dt * 8);
    const wide = st.w > 900;
    const base = variant === 'hero' ? 0.62 : 0.5;
    renderer.draw({
      time: reduced ? 0 : t,
      dark: isDark(),
      yaw: (reduced ? 0 : Math.sin(t * 0.18) * SWAY + Math.sin(t * 0.31 + 1.2) * SWAY * 0.2) + st.yaw,
      roll: reduced ? 0 : Math.sin(t * 1.1) * ROLL,
      dim: variant === 'hero' && st.w < 640 ? 0.6 : 1,   // narrow: dim the cloud
      pitch: TILT + st.pitch,
      panX: variant === 'ambient' ? (wide ? 0.16 : 0) : st.w < 640 ? 0.02 : 0.078,
      panY: st.scroll + (variant === 'ambient' ? 0.02 : st.w < 640 ? -0.12 : -0.06),
      heightFrac: st.w < 640 ? 0.42 : base,
      breathe: !reduced,
    });
    if (first) ctrl.stats.firstFrameMs = performance.now() - t0;
  };

  const build = () => {
    const t = performance.now();
    const count = pointCount(el);
    renderer.setPoints(buildSword(count));
    ctrl.count = count;
    ctrl.stats.buildMs = performance.now() - t;
  };

  const resize = () => {
    const w = Math.max(1, el.clientWidth || innerWidth);
    const h = Math.max(1, el.clientHeight || innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, lowPower() ? 1.5 : DPR_CAP);
    if (w === st.w && h === st.h && dpr === st.dpr) return;
    st.w = w; st.h = h; st.dpr = dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    renderer.resize(w, h, dpr);
    const want = pointCount(el);
    if (!ctrl.count || Math.abs(want - ctrl.count) / ctrl.count > 0.2) build();
    if (reduced || !st.running) draw(performance.now(), !ctrl.stats.firstFrameMs);
  };

  const frame = (now) => {
    if (!st.running) return;
    st.raf = requestAnimationFrame(frame);
    draw(now, false);
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
    if (st.inView && !document.hidden) start(); else stop();
  };

  /* input + lifecycle */
  const onPointer = (e) => {
    if (!parallaxOn || reduced) return;
    st.yawT = (e.clientX / Math.max(1, innerWidth) * 2 - 1) * PARALLAX;
    st.pitchT = (e.clientY / Math.max(1, innerHeight) * 2 - 1) * PARALLAX * 0.6;
  };
  const onScroll = () => {
    if (!parallaxOn || reduced) return;
    st.scrollT = -Math.min(1, (window.scrollY || 0) / Math.max(1, innerHeight)) * 0.12;
  };
  const onTheme = () => { if (!st.running) draw(performance.now(), false); };
  const onVis = () => sync();

  addEventListener('pointermove', onPointer, { passive: true });
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', resize);
  document.addEventListener('visibilitychange', onVis);

  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => { st.inView = entries[0].isIntersecting; sync(); }, { threshold: 0 })
    : null;
  if (io) io.observe(el);
  const ro = 'ResizeObserver' in window ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(el);
  const mo = new MutationObserver(onTheme);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const mqDarkChange = darkMQ();
  if (mqDarkChange.addEventListener) mqDarkChange.addEventListener('change', onTheme);

  ctrl.destroy = () => {
    stop();
    if (io) io.disconnect();
    if (ro) ro.disconnect();
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
