// hikari-zola entry point — native ES modules, no dependencies, no CDN.
// Loaded as <script type="module"> (deferred); every module is optional and
// failures are swallowed so a broken enhancement can never blank the page.
document.documentElement.classList.replace("no-js", "js");

const has = (selector) => document.querySelector(selector) !== null;
const load = (path) => import(path).catch(() => {});

const jobs = [];
if (has("[data-hk-theme-toggle]")) jobs.push(load("./prefs.js?v=202611161805"));
if (has("[data-hk-nav-toggle]") || has("[data-hk-drawer]") || has("[data-hk-progress]")) jobs.push(load("./nav.js?v=202611161805"));
if (has(".hk-reveal")) {
  // If reveal.js cannot load, drop the hidden state instead of hiding content.
  const items = Array.from(document.querySelectorAll(".hk-reveal"));
  const revealJob = import("./reveal.js?v=202611161805").catch(() => items.forEach((el) => el.classList.add("is-in")));
  jobs.push(revealJob);
}
if (has("[data-hk-toc]")) jobs.push(load("./toc.js?v=202611161805"));
if (has("pre.z-code")) jobs.push(load("./copy.js?v=202611161805"));
// backdrop/index.js self-mounts every [data-hk-backdrop] container it finds.
if (has("[data-hk-backdrop]")) jobs.push(load("./backdrop/index.js?v=202611161805"));

void Promise.all(jobs);