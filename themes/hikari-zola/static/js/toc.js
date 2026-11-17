const toc = document.querySelector("[data-hk-toc]");
if (toc) {
  const pairs = [];
  toc.querySelectorAll(".hk-toc__link").forEach((link) => {
    const href = link.getAttribute("href") || "";
    const hash = href.indexOf("#");
    if (hash < 0) return;
    let id = href.slice(hash + 1);
    try { id = decodeURIComponent(id); } catch (error) {  }
    const heading = id ? document.getElementById(id) : null;
    if (heading) pairs.push({ link, heading });
  });
  if (pairs.length) {
    let active = null;
    let frame = 0;
    const offset = () => (document.querySelector(".hk-topbar")?.offsetHeight || 64) + 24;
    const update = () => {
      frame = 0;
      const line = offset();
      let found = null;
      pairs.forEach((pair) => {
        if (pair.heading.getBoundingClientRect().top <= line) found = pair;
      });
      const link = found ? found.link : null;
      if (link === active) return;
      if (active) {
        active.classList.remove("is-active");
        active.removeAttribute("aria-current");
      }
      active = link;
      if (active) {
        active.classList.add("is-active");
        active.setAttribute("aria-current", "true");
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
    update();
  }
}
