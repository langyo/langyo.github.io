document.documentElement.classList.replace("no-js", "js");
const V = "?v=202611171742";
const has = (selector) => document.querySelector(selector) !== null;
const load = (path) => import(path + V).catch(() => {});
const jobs = [];
if (has("[data-hk-theme-toggle]")) jobs.push(load("./prefs.js"));
if (has("[data-hk-nav-toggle]") || has("[data-hk-drawer]") || has("[data-hk-progress]")) jobs.push(load("./nav.js"));
if (has(".hk-reveal")) {
  const items = Array.from(document.querySelectorAll(".hk-reveal"));
  jobs.push(import("./reveal.js" + V).catch(() => items.forEach((el) => el.classList.add("is-in"))));
}
if (has("[data-hk-toc]")) jobs.push(load("./toc.js"));
if (has("pre.z-code")) jobs.push(load("./copy.js"));
if (has("[data-hk-backdrop]")) jobs.push(load("./backdrop/index.js"));
jobs.push(load("./rail.js"));
void Promise.all(jobs);