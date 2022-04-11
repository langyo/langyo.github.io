import { defineStore } from 'pinia';
import { generate } from 'shortid';

export let initSSRData = (typeof window !== 'undefined' &&
  window['__SSRData'] && {
    ...window['__SSRData'],
    file: document.getElementById('markdown')?.innerHTML
  }) || { type: 'nil' };

export function setInitSSRData(data: { [key: string]: any }) {
  initSSRData = data;
}

export const useStoreForSSR = defineStore('ssr', {
  state: () => {
    return initSSRData as {
      type: string;
      title: string;
      file: string;
      tags?: string[];
      languages: { [language: string]: string };
    };
  }
});
