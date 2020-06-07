import chalk from 'chalk';

import Koa from 'koa';
import bodyParserMiddleware from 'koa-bodyparser';

import { serverLog as log } from 'nickelcat/utils/logger';
import { readFile } from "fs";
import { promisify } from "util";

const app = new Koa();

app.use(bodyParserMiddleware());

(async () => {
  // The middleware to print the request info to the console.
  app.use(async (ctx, next) => {
    log('info', `${chalk.green(ctx.request.method)} ${chalk.whiteBright(ctx.request.ip)}: Hit ${chalk.blue(ctx.request.url)}`);
    await next();
  });

  app.use(async (ctx, next) => {
      ctx.response.body = await promisify(readFile)('./index.html');
      ctx.response.type = 'text/html';
  });

  let port = process.env.PORT || 80;

  app.listen(port);

  log('info', `Server has been running at the port ${port}.`);
})();
