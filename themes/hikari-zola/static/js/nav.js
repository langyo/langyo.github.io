// HUD topbar behaviour: mobile drawer, scroll progress bar, ESC / outside click.
const drawer = document.querySelector("[data-hk-drawer]");
const toggles = Array.from(document.querySelectorAll("[data-hk-nav-toggle]"));
const progressBar = document.querySelector("[data-hk-progress] .hk-progress__bar") || document.querySelector(".hk-progress__bar");
let open = false;
let frame = 0;

function setIcons(expanded) {
  const label = expanded ? "关闭菜单" : "菜单";
  toggles.forEach((button) => {
    button.setAttribute("aria-expanded", String(expanded));
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
    button.querySelectorAll("[data-hk-nav-icon]").forEach((icon) => {
      icon.hidden = icon.getAttribute("data-hk-nav-icon") !== (expanded ? "close" : "menu");
    });
  });
}

function setDrawer(next, restoreFocus) {
  if (!drawer) return;
  open = next;
  drawer.classList.toggle("is-open", next);
  drawer.setAttribute("aria-hidden", String(!next));
  document.body.style.overflow = next ? "hidden" : "";
  setIcons(next);
  if (next) {
    const first = drawer.querySelector("a, button");
    if (first) first.focus({ preventScroll: true });
  } else if (restoreFocus && toggles[0]) {
    toggles[0].focus({ preventScroll: true });
  }
}

toggles.forEach((button) => button.addEventListener("click", () => setDrawer(!open, true)));

if (drawer) {
  drawer.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setDrawer(false, false)));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && open) setDrawer(false, true);
  });
  document.addEventListener("click", (event) => {
    if (!open) return;
    const target = event.target;
    if (drawer.contains(target) || toggles.some((button) => button.contains(target))) return;
    setDrawer(false, true);
  });
}

// The drawer is hidden by CSS on wide viewports: never leave the page in a
// locked-scroll state after a resize while it is open.
addEventListener("resize", () => {
  if (open && getComputedStyle(drawer).display === "none") setDrawer(false, true);
});

function updateProgress() {
  frame = 0;
  if (!progressBar) return;
  const doc = document.documentElement;
  const max = doc.scrollHeight - doc.clientHeight;
  const percent = max > 0 ? Math.min(100, Math.max(0, (window.scrollY / max) * 100)) : 0;
  progressBar.style.setProperty("--hk-progress", percent.toFixed(2) + "%");
}

function scheduleProgress() {
  if (!frame) frame = requestAnimationFrame(updateProgress);
}

if (progressBar) {
  addEventListener("scroll", scheduleProgress, { passive: true });
  addEventListener("resize", scheduleProgress);
  updateProgress();
}