// Entrance choreography: .hk-reveal => .is-in once, stagger comes from CSS --i.
// Robustness (spec 2.5 + lead review): content must never stay invisible — a
// full-page capture or a failed observer must not blank the page. Elements in
// the first viewport animate immediately; everything below is revealed on
// window.load (offscreen elements are not seen anyway), with a hard timer as a
// last resort if load never fires.
const items = Array.from(document.querySelectorAll(".hk-reveal"));
if (items.length) {
  const show = (element) => element.classList.add("is-in");
  const revealAll = () => items.forEach(show);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduced || !("IntersectionObserver" in window)) {
    revealAll();
  } else {
    const height = window.innerHeight || document.documentElement.clientHeight;
    const rest = [];
    items.forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.top < height && rect.bottom > 0) show(element);
      else rest.push(element);
    });

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        show(entry.target);
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.01 });
    rest.forEach((element) => observer.observe(element));

    // After load nothing may remain hidden: full-page screenshots and readers
    // without scroll interaction have to see the whole document.
    const finish = () => requestAnimationFrame(revealAll);
    if (document.readyState === "complete") finish();
    else addEventListener("load", finish, { once: true });
    setTimeout(revealAll, 1500);
  }
}