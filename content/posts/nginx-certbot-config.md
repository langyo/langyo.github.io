+++
title="以 Nginx 为反代服务端时以 Certbot 自动申请 HTTPS 证书的流程"
date=2024-03-15
draft=false
+++

小时候，我对 HTTPS 证书的印象还停留在“我自己只要 80 端口开着，其余就给平台处理吧”的阶段。随着阅历的提升，我越发意识到完全由自己网站掌握 HTTPS 通信链路的重要性，不然诸如 CDN 或者反代之类的优化手段就无法使用了。

下面是我在 Nginx 为反代服务端时以 Certbot 自动申请 HTTPS 证书的流程。

## 1. 安装 Nginx 与 Certbot

这里我以 Ubuntu 系统作例子，别的发行版的方法大同小异。先更新一下包管理器：

```bash
sudo apt update
sudo apt upgrade
```

然后安装 Nginx 与 Certbot：

```bash
sudo apt install nginx certbot
```

确保 Nginx 服务已经启动：

```bash
sudo systemctl start nginx
```

> 这里有个小坑，**建议**以 `systemctl` 作为 daemon (守护进程) 启动 nginx，这样它才能有权限正常操作 `/etc/nginx` 目录下的内容。**不要**直接用 `nginx` 命令启动，否则很可能会导致权限问题、nginx 无权读取配置文件。

## 2. 配置 Nginx 以临时给 .well-known 目录开口

Certbot 会在申请证书时，通过让对面的鉴权服务器访问 `http://xxx.com/.well-known/` 来验证你对该域名的控制权，所以我们需要配置 Nginx 以临时给 `.well-known` 目录开口。

我们先在 `/etc/nginx/conf.d/` 下新建一个专门只开 80 端口的配置文件，例如 `site.conf`：

```nginx
server {
    listen 80;
    server_name xxx.com;

    location ~ ^/\.well-known/ {
        root /usr/share/nginx/html;
    }

    location / {
        return https://xxx.com$uri;
    }
}
```

然后重启 Nginx 服务，开始监听：

```bash
nginx -s reload
```

> 可以先用 `nginx -t` 检查一下配置文件是否有语法错误。

## 3. 申请 HTTPS 证书

现在我们可以用 Certbot 申请**第一次**的 HTTPS 证书了：

```bash
certbot certonly --webroot -w /usr/share/nginx/html -d xxx.com -m email@xxx.com --agree-tos
```

其中，`-w` 参数指定了 webroot 的路径，`-d` 参数指定了域名，`-m` 参数指定了邮箱。

> 后续的证书更新，只需要执行 `certbot renew` 即可，不需要打完整指令。

## 4. 启动后台服务，例如 docker 容器

例如，后台开一个 wordpress 的 docker 容器，放在 3000 端口：

```bash
docker run -d -p 3000:80 --name wordpress wordpress:latest
```

> 这里的 `-d` 是放在后台运行，跑完指令之后容器不会直接原地退出； `-p 3000:80` 是将容器中的 `80` 端口映射到宿主机的 `3000` 端口；`--name` 参数是给容器起个名字，方便后续操作。
>
> 这里的 `3000` 端口是随便取的，只要不和宿主机的其他端口冲突就行；后续给服务器设置防火墙时，不要放行 `3000` 端口，以免直接暴露容器。

## 5. 配置 Nginx 以使用 HTTPS 证书

在 `/etc/nginx/conf.d/` 下新增一个专门开 443 端口的配置文件，例如 `site-ssl.conf`：

```nginx
server {
    listen 443 ssl;
    server_name xxx.com;

    ssl_certificate /etc/letsencrypt/live/xxx.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/xxx.com/privkey.pem;

    location ~ ^/\.well-known/ {
        root /usr/share/nginx/html;
    }

    location ~ .* {
        proxy_redirect off;
        proxy_set_header Host $host;
        proxy_set_header X-Ssl on;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        proxy_pass http://localhost:3000;
    }
}
```

然后重新加载 Nginx 配置：

```bash
nginx -s reload
```

## 6. 增加计划任务

最后，我们可以增加一个计划任务，每个月自动更新一次证书。

首先准备一个脚本，例如放在 `/home/cert-update.sh`，先以 Certbot 更新证书，然后通知 Nginx 更新证书：

```bash
#!/bin/bash
certbot renew
nginx -s reload
```

然后增加一个计划任务，每个月执行一次。先打开计划任务编辑器：

```bash
crontab -e
```

选择完编辑器后，在打开的编辑器中增加一行：

```bash
0 0 1 * * /bin/bash /home/cert-update.sh
```

> 这里的 `0 0 1 * *` 是指每个月的第一天零点零分执行一次。
