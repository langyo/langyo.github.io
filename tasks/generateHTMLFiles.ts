import webpack from 'webpack';
import { Script as VMScript, createContext as createVMContext } from 'vm';
import { VueLoaderPlugin } from 'vue-loader';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import { minify as minifyCSS } from 'csso';
import JSON5 from 'json5';
import { join } from 'path';
import { readFile, writeFile } from 'fs/promises';
import { marked } from 'marked';
import { encode as encodeBase64 } from 'js-base64';
import {
  globalWebpackConfig,
  resolveWebpackCompileResult,
  createWebpackVirtualFileSystem,
  generatePageHash
} from './utils';

export async function generateHTMLFiles() {
  const compiler = webpack({
    entry: join(process.cwd(), './src/appServerRender.ts'),
    module: {
      rules: [
        {
          test: /\.json5$/,
          use: ['json5-loader']
        },
        {
          test: /\.svg$/,
          use: ['svg-inline-loader']
        },
        {
          test: /\.vue$/,
          use: ['vue-loader']
        },
        {
          test: /\.ts$/,
          use: [
            {
              loader: 'ts-loader',
              options: {
                appendTsSuffixTo: [/\.vue$/],
                transpileOnly: true
              }
            }
          ]
        },
        {
          test: /\.css$/,
          use: [
            MiniCssExtractPlugin.loader,
            {
              loader: 'css-loader',
              options: {
                url: false
              }
            }
          ]
        },
        {
          test: /\.scss$/,
          use: [
            MiniCssExtractPlugin.loader,
            {
              loader: 'css-loader',
              options: {
                url: false
              }
            },
            'sass-loader'
          ]
        }
      ]
    },
    plugins: [
      new VueLoaderPlugin(),
      new MiniCssExtractPlugin({ filename: 'web.bundle.css' })
    ],
    ...globalWebpackConfig,
    target: 'node',
    output: {
      path: join(process.cwd(), './dist/'),
      filename: `serverRender.js`
    }
  });
  const fs = createWebpackVirtualFileSystem({});
  compiler.outputFileSystem = fs;
  await resolveWebpackCompileResult(compiler);
  const runnableServerRenderCode = (await fs.promises.readFile(
    join(process.cwd(), './dist/serverRender.js'),
    'utf8'
  )) as string;
  const runnableServerRender = new VMScript(runnableServerRenderCode);
  async function callServerRender(path: string, data: any) {
    return new Promise<string>((resolve, reject) => {
      runnableServerRender.runInContext(
        createVMContext({
          ...global,
          process,
          require,
          console,
          path,
          data,
          callbackResult(result: Promise<string>) {
            result.then(resolve).catch(reject);
          }
        })
      );
    });
  }

  async function htmlRawGenerator(path: string, data: any, title?: string) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="description" content="伊欧 个人主页">
  <meta name="viewport" content="width=device-width,initial-scale=1.0,minimum-scale=1.0,maximum-scale=1.0,user-scalable=0" />
  <title>${title ? `${title} - ` : ''}伊欧の个人主页</title>
  <link rel="preload" href="/web.bundle.js" as="script" />
  <link rel="icon" href="/favicon.ico" />
  <link href="/web.bundle.css" rel="stylesheet" />
  <script src="https://hm.baidu.com/hm.js?fc12df3f4e0ce179cd3ec6a5d5b33627"></script>
</head>
<body>
  <div id="__root">${await callServerRender(path, data)}</div>
  <style>${
    minifyCSS(`
      #nojavascript-alert {
        position: fixed;
        width: 100vw;
        height: 100vh;
        left: 0vw;
        top: 0vh;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 114514;
        user-select: none;
      }
      
      #nojavascript-alert > p {
        color: white;
        font-size: 2em;
        font-family: cursive;
      }
  `).css
  }</style>
  <noscript id="nojavascript-alert">
    <p>Please allow JavaScript on this site.</p>
    <p>请打开JavaScript的运行权限。</p>
  </noscript>
  <script>window['__SSRData']=${JSON5.stringify(
    Object.keys(data)
      .filter((key) => key !== 'file')
      .reduce((obj, key) => ({ ...obj, [key]: data[key] }), {})
  )}</script>
  <script src="/web.bundle.js"></script>
</body>
</html>`;
  }

  await writeFile(
    join(process.cwd(), './dist/index.html'),
    await htmlRawGenerator('/', { type: 'nil' })
  );
}
