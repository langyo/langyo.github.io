import { series, watch } from 'gulp';

import { clean } from './tasks/clean';
import { generateHTMLFiles } from './tasks/generateHTMLFiles';
import {
  generateMainlyScripts,
  generateServiceWorkerScripts
} from './tasks/generateScripts';
import { obfuscateForPruduction } from './tasks/obfuscateScripts';

export { clean };

export const build = series(
  clean,
  generateHTMLFiles,
  generateMainlyScripts,
  generateServiceWorkerScripts
);

export const publish = series(clean, build, obfuscateForPruduction);

export const dev = () => watch('src/**/*', series(generateMainlyScripts));
