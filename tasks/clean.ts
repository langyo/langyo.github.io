import { series } from 'gulp';
import JSON5 from 'json5';
import { join } from 'path';
import { readFile, readdir, unlink, stat, mkdir } from 'fs/promises';

export const clean = series(
  async function removeFiles() {
    async function dfs(path: string) {
      try {
        for (const name of await readdir(path)) {
          try {
            if ((await stat(join(path, name))).isDirectory()) {
              dfs(join(path, name));
            } else {
              await unlink(join(path, name));
            }
          } catch (err) {
            console.warn(err);
          }
        }
      } catch (err) {
        console.warn(err);
      }
    }
  },

  async function regenerateEmptyFolder() {
    try {
      await mkdir(join(process.cwd(), './dist'), { recursive: true });
    } catch {}
  }
);
