import { series } from 'gulp';
import { obfuscate } from 'javascript-obfuscator';
import { join } from 'path';
import { readFile, writeFile } from 'fs/promises';

async function obfuscateMainlyScripts() {
  const filePath = join(process.cwd(), './dist/web.bundle.js');
  await writeFile(
    filePath,
    obfuscate(await readFile(filePath, 'utf8'), {
      target: 'browser-no-eval',
      seed: Date.now(),
      disableConsoleOutput: false,
      domainLock: ['langyo.xyz', 'www.langyo.xyz'],
      domainLockRedirectUrl: 'https://langyo.xyz'
    }).getObfuscatedCode()
  );
}

async function obfuscateServiceWorkerScripts() {
  const filePath = join(process.cwd(), './dist/sw.js');
  await writeFile(
    filePath,
    obfuscate(await readFile(filePath, 'utf8'), {
      target: 'browser-no-eval',
      seed: Date.now(),
      disableConsoleOutput: true
    }).getObfuscatedCode()
  );
}

export const obfuscateForPruduction = series(
  obfuscateMainlyScripts,
  obfuscateServiceWorkerScripts
);
