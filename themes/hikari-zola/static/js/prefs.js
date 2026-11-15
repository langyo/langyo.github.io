// Theme preference: html[data-theme], localStorage "hk-theme", meta theme-color,
// and the two-state toggle button (aria-pressed + sun/moon icon swap).
const KEY = "hk-theme";
const COLORS = { light: "#f7faff", dark: "#07121c" };
const root = document.documentElement;
const system = () => (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

function stored() {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch (error) {
    return null;
  }
}

function current() {
  const attr = root.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return stored() || system();
}

function sync(theme) {
  const dark = theme === "dark";
  const label = dark ? "切换到亮色主题" : "切换到暗色主题";
  root.setAttribute("data-theme", theme);
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.removeAttribute("media");
    meta.setAttribute("content", COLORS[theme]);
  });
  document.querySelectorAll("[data-hk-theme-toggle]").forEach((button) => {
    button.setAttribute("aria-pressed", String(dark));
    button.setAttribute("title", label);
    button.setAttribute("aria-label", label);
    button.querySelectorAll("[data-hk-theme-icon]").forEach((icon) => {
      icon.hidden = icon.getAttribute("data-hk-theme-icon") !== theme;
    });
  });
}

document.querySelectorAll("[data-hk-theme-toggle]").forEach((button) => {
  button.addEventListener("click", () => {
    const next = current() === "dark" ? "light" : "dark";
    try { localStorage.setItem(KEY, next); } catch (error) { /* private mode */ }
    sync(next);
  });
});

sync(current());

const preference = matchMedia("(prefers-color-scheme: dark)");
const onPreference = () => { if (!stored()) sync(system()); };
if (preference.addEventListener) preference.addEventListener("change", onPreference);
