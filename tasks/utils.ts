import webpack from 'webpack';
import { Volume, IFs } from 'memfs';
import { Union } from 'unionfs';
import * as realFs from 'fs';
import WebpackTerserPlugin from 'terser-webpack-plugin';
import JSON5 from 'json5';
import { join } from 'path';
import Crypto from 'crypto-js';

export const isDevelopmentMode = process.argv.indexOf('--dev') >= 0;
console.log(
  `You are in the ${isDevelopmentMode ? 'development' : 'production'} mode.`
);

export async function resolveWebpackCompileResult(
  runnableWebpackObject: webpack.Compiler
) {
  return await new Promise(
    (resolve: (sth: any) => void, reject: (sth: any) => void) =>
      runnableWebpackObject.run((err: Error, stats: webpack.Stats) => {
        if (err) {
          console.error(err);
          reject(err);
        }
        const info = stats.toJson();
        if (stats.hasErrors()) {
          for (let line of info.errors) {
            console.error(line.message);
            reject(err);
          }
        }
        if (stats.hasWarnings()) {
          for (let line of info.warnings) {
            console.warn(line.message);
          }
        }
        resolve(stats);
      })
  );
}

export const globalWebpackConfig: webpack.Configuration = {
  resolve: {
    alias: {
      '@': join(process.cwd(), './src'),
      '@res': join(process.cwd(), './res')
    },
    extensions: ['.js', '.jsx', '.mjs', '.ts', '.tsx'],
    modules: [join(process.cwd(), './node_modules'), 'node_modules']
  },
  resolveLoader: {
    modules: [join(process.cwd(), './node_modules'), 'node_modules']
  },
  ...(isDevelopmentMode
    ? {
        mode: 'development',
        devtool: 'inline-source-map',
        cache: {
          type: 'filesystem'
        }
      }
    : {
        mode: 'production',
        optimization: {
          minimize: true,
          minimizer: [
            new WebpackTerserPlugin({
              extractComments: false
            })
          ]
        }
      })
};

export function createWebpackVirtualFileSystem(data: any) {
  const webpackVirtualFs: IFs = (new Union() as any).use(realFs).use(
    Volume.fromJSON({
      [join(process.cwd(), './src/utils/SSR.json5')]: JSON5.stringify(data)
    })
  );
  webpackVirtualFs['join'] = join;
  return webpackVirtualFs;
}

export function generatePageHash(
  authors: string[],
  model: string,
  title: string,
  language: string
) {
  return Crypto.SHA1(
    `${authors.join(',')}-${model}-${title}-${language}`
  ).toString();
}

export function squeezeObject(obj: any): string {
  if (Array.isArray(obj)) {
    return obj
      .map((n) => squeezeObject(n))
      .join('')
      .split('')
      .reduce((str, char) => str + (str.indexOf(char) >= 0 ? '' : char), '');
  } else if (typeof obj === 'object') {
    return Object.keys(obj)
      .map((n) => squeezeObject(obj[n]))
      .join('')
      .split('')
      .reduce((str, char) => str + (str.indexOf(char) >= 0 ? '' : char), '');
  } else {
    return obj;
  }
}
