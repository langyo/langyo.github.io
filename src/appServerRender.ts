import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { createPinia } from 'pinia';

import { generateRouter } from './utils/router';
import { i18n } from './utils/i18n';
import { setInitSSRData } from './utils/store';

import App from './app.vue';
import { createMemoryHistory } from 'vue-router';

declare global {
  const path: string;
  const data: any;
  function callbackResult(result: Promise<string>): void;
}

(async () => {
  const app = createSSRApp(App);

  setInitSSRData(data);
  app.use(createPinia());
  const router = generateRouter(createMemoryHistory());
  await router.replace(path);
  app.use(router);
  app.use(i18n);

  callbackResult(renderToString(app));  
})();
