/* hikari overlay scrollbars (no Vue): wrap scroll regions, drive the thumb, pan by wheel/drag. */
const S = '.hk-toc,.hk-works,.hk-gh__repos,.hk-dossier__card', A = [];
const fix = (el) => {
  if (el.__sb) return;
  const x = !(el.scrollHeight - el.clientHeight > 4);
  if (x && !(el.scrollWidth - el.clientWidth > 4)) return;
  const C = x ? 'scrollWidth' : 'scrollHeight', Z = x ? 'scrollLeft' : 'scrollTop',
        L = x ? 'clientWidth' : 'clientHeight', E = x ? 'clientX' : 'clientY',
        D = x ? 'width' : 'height', T = x ? 'X' : 'Y', cs = getComputedStyle(el),
        w = document.createElement('div'), t = document.createElement('div'), h = document.createElement('div');
  w.className = 'hk-scrollbox';
  t.className = 'hk-scrollbar-track';
  h.className = 'hk-scrollbar-thumb';
  w.style.cssText = 'position:relative;overflow:hidden;align-self:' + cs.alignSelf +
    (cs.position === 'sticky' ? ';position:sticky;top:' + cs.top : '');
  if (x) t.dataset.axis = 'horizontal';
  t.appendChild(h);
  el.parentNode.insertBefore(w, el);
  w.append(el, t);
  const y = () => {
    const s = Math.max(20, el[L] * el[L] / el[C]), g = el[L] - s, m = el[C] - el[L];
    h.style[D] = s + 'px';
    h.style.transform = 'translate' + T + '(' + (m > 0 ? Math.min(g, Math.max(0, el[Z] / m * g)) : 0) + 'px)';
  };
  el.onscroll = () => {
    y();
    t.classList.add('is-scrolling');
    clearTimeout(el.tm);
    el.tm = setTimeout(() => t.classList.remove('is-scrolling'), 800);
  };
  w.onmouseenter = () => t.classList.add('is-hovering');
  w.onmouseleave = () => t.classList.remove('is-hovering');
  el.addEventListener('wheel', (e) => {              // wheel pans this region's own axis
    const d = x ? e.deltaY : e.deltaX;
    if (Math.abs(d) > Math.abs(x ? e.deltaX : e.deltaY)) { e.preventDefault(); el[Z] += d; }
  }, { passive: false });
  let g = null, PAN = 0;
  w.addEventListener('pointerdown', (e) => {
    const th = e.target === h;
    if (e.button > 0 || (!th && !el.contains(e.target))) return;
    g = [e[E], el[Z], th ? (el[C] - el[L]) / Math.max(1, el[L] - h.offsetHeight) : -1, th ? 1 : 0];
    PAN = 0;
    if (th) { h.classList.add('is-dragging'); e.preventDefault(); }
    try { w.setPointerCapture(e.pointerId); } catch (_) {}
  });
  w.addEventListener('pointermove', (e) => {
    if (!g) return;
    const d = e[E] - g[0];
    if (!g[3] && Math.abs(d) < 4) return;            // 4px: a click stays a click
    if (!g[3]) { g[3] = 1; PAN = 1; w.classList.add('is-dragging'); }
    el[Z] = g[1] + d * g[2];
    e.preventDefault();
  });
  const stop = () => { g = null; h.classList.remove('is-dragging'); w.classList.remove('is-dragging'); };
  w.addEventListener('pointerup', stop);
  w.addEventListener('pointercancel', stop);
  w.addEventListener('click', (e) => {               // swallow the click a pan would fire
    if (PAN) { e.preventDefault(); e.stopPropagation(); PAN = 0; }
  }, true);
  el.__sb = y;
  A.push(y);
  y();
};
const mount = () => document.querySelectorAll(S).forEach((el) => { try { fix(el); } catch (e) {} });
let rt = 0;
addEventListener('resize', () => {
  clearTimeout(rt);
  rt = setTimeout(() => { mount(); A.forEach((f) => { try { f(); } catch (e) {} }); }, 150);
}, { passive: true });
addEventListener('load', mount);
try { mount(); } catch (e) {}
export default mount;
