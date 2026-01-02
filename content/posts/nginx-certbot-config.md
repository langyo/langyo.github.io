+++
title="以 Nginx 为反代服务端时以 Certbot 自动申请 HTTPS 证书的流程"
date=2024-03-15
draft=false
+++

小时候，我对 HTTPS 证书的印象还停留在“我自己只要 80 端口开着，其余就给平台处理吧”的阶段。随着阅历的提升，我越发意识到完全由自己网站掌握 HTTPS 通信链路的重要性，不然诸如 CDN 或者反代之类的优化手段就无法使用了。

下面是我在 Nginx 为反代服务端时以 Certbot 自动申请 HTTPS 证书的流程。

> Nginx 自 1.29 起，[基于 ACMEv2 协议的自动申领 HTTPS 证书模块](https://nginx.org/en/docs/http/ngx_http_acme_module.html)将直接随附 Nginx 安装，相比较于手动方式更稳妥、更方便。如果想看自动方式，可以直接拉到文章末尾，我额外补充了基于该模块的自动申领流程。

## 1. 安装 Nginx 与 Certbot

这里我以 Ubuntu 系统作例子，别的发行版的方法大同小异。先更新一下包管理器：

```bash
# 国内建议选用镜像源，例如可以使用 https://linuxmirrors.cn 的换源脚本
sudo apt update
sudo apt upgrade
```

然后安装 Nginx 与 Certbot：

```bash
sudo apt install nginx certbot -y
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

## 7. 自动获取证书流程

新版本的 Nginx 开始支持了自动申领与更新 HTTPS 证书的能力，这里我们还是以 Certbot 作为签发平台，尝试一下操作。

> 如果你是直接跳到这里的，恭喜你，前面那 5 步你应该是一步也不用做了，就第一步安装得看看……

还是在 `/etc/nginx/conf.d` 下创建或修改已有配置：

```nginx
# 这里需要先定义提供商，也就是 certbot 默认的提供商 Let's Encrypt
acme_issuer letsencrypt {
    uri         https://acme-v02.api.letsencrypt.org/directory;
    # contact   你的邮箱@xxx.com;
    state_path  /var/cache/nginx/acme-letsencrypt;

    accept_terms_of_service; # 嗯，我同意使用，你别再问我同不同意了（
}

# 可选，设定共享缓存，这样一个服务器的不同 nginx 配置证书就都能塞一起了
acme_shared_zone zone=ngx_acme_shared:1M;

# 目前唯一支持的 HTTP-01 质询方法必须要求服务端好歹开了 80 端口
# 哪怕你以后不准备在这里加任何路由，也不能省略，起码得返回个 404
server {
    # 响应 ACME HTTP-01 质询
    listen 80;

    location / {
        # 默认写个空响应
        return 404;
    }
}

server {
    listen 443 ssl;
    server_name xxx.com;

    # 这里写的证书路径可以直接用 Nginx 变量，很方便
    # 下面的 ACME 自动质询配置是会自动设定这里的值的，不需要自己再手写
    ssl_certificate       $acme_certificate;
    ssl_certificate_key   $acme_certificate_key;
    ssl_certificate_cache max=2; # 可选，最多保存最近几份缓存证书，这样过期了的能自动删

    # 这里配置 ACME 自动质询
    acme on;
    acme_domain xxx.com;
    acme_email 你的邮箱@xxx.com;
    acme_certificate letsencrypt; # 前面用的啥名儿，这儿就写的啥

    location / {
        proxy_pass http://localhost:3000;
    }
}
```

……其实这就结束了！

请记得通过 `nginx -t` 确认你的 Nginx 版本，必须至少为 1.29。

> 如果你尴尬的发现服务器上的 nginx 不是最新的，你可以试试用各种包管理器进行更新，例如 Debian/Ubuntu 可以用 `sudo apt update && sudo apt upgrade nginx`，然后再 `nginx -t` 看看。
