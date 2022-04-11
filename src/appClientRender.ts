import { createSSRApp } from 'vue';
import { createWebHistory } from 'vue-router';
import { createPinia } from 'pinia';
import UAParser from 'ua-parser-js';

import { generateRouter } from './utils/router';
import { i18n } from './utils/i18n';
import './utils/store';

import App from './app.vue';

function createWarningFrame(messages: string[]) {
  document.body.appendChild(
    (() => {
      let node = document.createElement('div');
      for (const message of messages) {
        node.appendChild(
          (() => {
            let node = document.createElement('div');
            node.innerText = message;
            node.style.cssText =
              'font-size: 2em; font-family: cursive; text-align: center;';
            return node;
          })()
        );
      }
      node.style.cssText =
        'position: fixed; left: 0px; top: 0px; width: 100%; height: 100%; box-sizing: border-box; padding: 4em; background: black; color: white; opacity: 0.8; display: flex; flex-direction: column; align-items: center; justify-content: center;';
      return node;
    })()
  );
}

(async () => {
  console.log(
    '%c日冕控制终端',
    'font: bold 2em 楷体;padding: 0.5em;margin:4px; line-height: 3em; background: rgba(199, 120, 31, 0.6);color: white;border-radius: 4px;'
  );
  console.log(
    '%c  欢迎，您已接入神州工部前台终端。',
    'font: 1.5em 楷体; background: rgba(199, 120, 31, 0.6);color: white;line-height: 1.5em;padding: 4px;box-decoration-break: clone;border-radius: 4px;margin: 4px;'
  );

  try {
    if (
      ['console', 'mobile', 'smarttv', 'wearable'].indexOf(
        new UAParser().getDevice().type
      ) >= 0
    ) {
      createWarningFrame([
        `请在桌面设备访问网站。`,
        `Please visit website by desktop devices.`
      ]);
    }

    const app = createSSRApp(App);

    app.use(createPinia());
    app.use(generateRouter(createWebHistory()));
    app.use(i18n);

    app.mount('#__root');
  } catch (e) {
    console.error(e);
    createWarningFrame([
      `${e}`,
      `页面遇到了一些错误，我们对此带来的不便深表歉意。稍后页面将尝试刷新。`,
      `The page has encountered some errors. We apologize for the inconvenience. The page will try to refresh later.`
    ]);
    setTimeout(() => location.reload(), 1000);
  }

  try {
    // Try to create service worker.
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      navigator.serviceWorker.addEventListener('controllerchange', () =>
        location.reload()
      );
    } else {
      throw Error('Not supported service worker.');
    }
  } catch (e) {
    console.error(e);
  }
})();
