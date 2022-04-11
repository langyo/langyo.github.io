import { createRouter, Router, RouterHistory } from 'vue-router';

import Overview from '@/pages/overview.vue';
import Oops from '@/pages/oops.vue';

export let router: Router;

export function generateRouter(history: RouterHistory) {
  if (!router) {
    router = createRouter({
      history,
      routes: [
        { path: '/', name: 'overview', component: async () => Overview },
        { path: '/oops', name: 'oops', component: async () => Oops },
        { path: '/:pathMatch(.*)*', redirect: '/oops' }
      ]
    });
  }
  return router;
}
