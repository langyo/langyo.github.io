/* Smooth wheel panning for horizontal rails; native scrollbars do the rest. */
const S = '.hk-works,.hk-gh__repos,.hk-toc,.hk-dossier__card';
const EASE = 0.22;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fix = (el) => {
  if (el.__rail) return;
  const horiz = !(el.scrollHeight - el.clientHeight > 4);
  if (horiz && !(el.scrollWidth - el.clientWidth > 4)) return;
  if (!horiz && !(el.scrollHeight - el.clientHeight > 4)) return;
  el.__rail = 1;
  const K = horiz ? 'scrollLeft' : 'scrollTop';
  const M = horiz ? 'scrollWidth' : 'scrollHeight';
  const L = horiz ? 'clientWidth' : 'clientHeight';
  let target = el[K], raf = 0, snapT = 0;
  // snap would pull every intermediate frame back: suspend while we drive
  const release = () => {
    el.style.scrollSnapType = 'none';
    clearTimeout(snapT);
    snapT = setTimeout(() => { el.style.scrollSnapType = ''; }, 260);
  };
  const step = () => {
    const d = target - el[K];
    if (Math.abs(d) < 0.5) { el[K] = target; raf = 0; return; }
    el[K] += d * EASE;
    raf = requestAnimationFrame(step);
  };
  el.addEventListener('wheel', (e) => {
    const d = horiz ? e.deltaY : e.deltaX;
    if (Math.abs(d) <= Math.abs(horiz ? e.deltaX : e.deltaY)) return;
    const max = el[M] - el[L];
    if (max <= 0) return;
    const base = raf ? target : el[K];
    const to = base + d;
    if ((to < 0 && base <= 0) || (to > max && base >= max)) return; // hand the wheel to the page
    e.preventDefault();
    target = Math.max(0, Math.min(max, to));
    if (reduced) { el[K] = target; return; }
    release();
    if (!raf) raf = requestAnimationFrame(step);
  }, { passive: false });
  el.addEventListener('pointerdown', release, { passive: true });
  el.addEventListener('scroll', () => { if (!raf) target = el[K]; }, { passive: true });
};
const mount = () => document.querySelectorAll(S).forEach((el) => { try { fix(el); } catch (e) {} });
addEventListener('load', mount);
try { mount(); } catch (e) {}
export default mount;
