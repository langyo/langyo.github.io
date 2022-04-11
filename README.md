# Homepage

《命令与征服：红色警戒 3™》日冕 Mod 官网站点

## 部署

- 请先确保您的机器已经安装了 Git, NodeJS 与 Nginx，并且 NodeJS 的版本不得低于 16。

- 请使用 Yarn 下载 NodeJS 依赖。如果尚未安装，请在启用管理员权限的情况下运行`npm i yarn -g`。对于 Linux 用户，NPM 可能会出现问题，需要借助包管理器才能安装。

- 在该项目文件夹所在位置运行`yarn`，以下载 NodeJS 依赖。

- 运行`npm run build`开始构建，构建的内容将在该项目下的`dist`文件夹。在 Nginx 服务端实际运行时，将同时需要读取该项目下`dist`文件夹与`res`文件夹的内容。

- 为您的机器上的 Nginx 进行适当配置，在 Nginx 的配置文件中以**绝对路径**引用本项目下的`dist/nginx.conf`文件。

```nginx
# 这是一份示例配置
# Here is a sample configuration

http {
  include mime.types;
  default_type text/html;
  sendfile on;
  keepalive_timeout 65;

  server {
    listen 80;
    server_name localhost;

    gzip on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_buffers 16 8k;
    gzip_min_length 256;
    gzip_types application/atom+xml application/javascript application/json application/rss+xml
      application/vnd.ms-fontobject application/x-font-opentype application/x-font-truetype
      application/x-font-ttf application/x-javascript application/xhtml+xml application/xml
      font/eot font/opentype font/otf font/truetype image/svg+xml image/vnd.microsoft.icon
      image/x-icon image/x-win-bitmap text/css text/javascript text/plain text/xml;

    include D:/path/to/CoronaHomepage/dist/nginx.conf;
  }
}
```

- 启动或重启 Nginx 服务端。在基于 Linux 内核的操作系统中，一般的做法是在启用管理员权限后运行`nginx`命令或`nginx -s reload`命令（如果已经启动了 Nginx）；在基于 Windows NT 的操作系统中，一般的做法是在 Nginx 的可执行文件所在的路径下，运行`start .\nginx.exe`命令或`.\nginx.exe -s reload`命令（如果已经启动了 Nginx）。

- 官网的备用下载节点仓库已由 NPM 的预安装脚本创建，位置在`dist/backup`。备用节点仓库的内容构建由构建脚本（即`npm run build`执行时运行的程序）兼管，部署应当人工进行。

> 备用下载节点基于 [NPM](https://www.npmjs.com/package/ra3-corona-development-website-static-backup) 以及为 NPM 提供加速服务的 CDN 节点，目前只有这些节点是在现有网络环境下做到稳定提供跨域连接的。
>
> 原先我们有尝试使用 Gitlab 与 Gitee 的 raw 节点，但这些节点没有允许跨域下载行为（缺少必要的 HTTP 头），所以暂时无法在浏览器环境下使用他们的服务。
