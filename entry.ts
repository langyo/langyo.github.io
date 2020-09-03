import * as chalk from 'chalk';
import * as Koa from 'koa';
import * as bodyParserMiddleware from 'koa-bodyparser';
import * as staticServer from 'koa-static-server';

import { writeFileSync } from "fs";

const app = new Koa();

app.use(bodyParserMiddleware());

(async () => {
  // The middleware to print the request info to the console.
  app.use(async (ctx, next) => {
    console.log(`${chalk.green(ctx.request.method)} ${chalk.whiteBright(ctx.request.ip)}: Hit ${chalk.blue(ctx.request.url)}`);
    writeFileSync('./latest.log', `${(new Date()).toLocaleString()} ${ctx.request.method} ${ctx.request.ip} ${ctx.request.url}\n`, { flag: 'a' });
    await next()
  });

  app.use(staticServer({ rootDir: 'public', rootPath: '/' }));
  let port = 8080;

  app.listen(port);

  console.log(`Server has been running at the port ${port}.`);
})();
