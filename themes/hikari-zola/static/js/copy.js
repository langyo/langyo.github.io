const ICON = (path) => '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true" style="vertical-align:-2px;margin-right:5px"><path d="' + path + '"/></svg>';
const COPY_ICON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true" style="vertical-align:-2px;margin-right:5px"><rect x="9" y="9" width="11" height="11"></rect><path d="M15 5H5v10"></path></svg>';
const CHECK_ICON = ICON("M4 12.5 9.5 18 20 6");
function language(pre) {
  const match = /language-([a-z0-9+#-]+)/i.exec(pre.className || "");
  return (match ? match[1] : pre.getAttribute("data-lang") || "text").toUpperCase();
}
function fallbackCopy(text) {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "-1000px";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch (error) { ok = false; }
  area.remove();
  return ok;
}
async function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try { await navigator.clipboard.writeText(text); return true; } catch (error) {  }
  }
  return fallbackCopy(text);
}
function setButton(button, icon, text, label) {
  button.innerHTML = icon + "<span>" + text + "</span>";
  button.setAttribute("aria-label", label);
}
function enhance(pre) {
  if (pre.closest(".hk-code")) return;
  const wrapper = document.createElement("div");
  wrapper.className = "hk-code";
  const head = document.createElement("div");
  head.className = "hk-code__head";
  const lang = document.createElement("span");
  lang.className = "hk-code__lang";
  lang.textContent = language(pre);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "hk-code__copy";
  button.setAttribute("data-hk-code-copy", "");
  setButton(button, COPY_ICON, "COPY", "复制代码");
  head.appendChild(lang);
  head.appendChild(button);
  const body = document.createElement("div");
  body.className = "hk-code__body";
  pre.parentNode.insertBefore(wrapper, pre);
  body.appendChild(pre);
  wrapper.appendChild(head);
  wrapper.appendChild(body);
  let timer = 0;
  button.addEventListener("click", async () => {
    const ok = await copyText((pre.textContent || "").replace(/\n$/, ""));
    button.classList.toggle("is-done", ok);
    setButton(button, ok ? CHECK_ICON : COPY_ICON, ok ? "COPIED" : "COPY", ok ? "已复制" : "复制代码");
    clearTimeout(timer);
    timer = setTimeout(() => {
      button.classList.remove("is-done");
      setButton(button, COPY_ICON, "COPY", "复制代码");
    }, 1800);
  });
}
document.querySelectorAll("pre.z-code").forEach(enhance);
