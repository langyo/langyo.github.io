+++
title="让本地 Docker CLI 连上别处服务器的 Dockerd 服务的方法"
date=2025-08-11
draft=false
+++

前段时间，我实验室的工作站原装的 Win11 出了点问题，尝试开启多用户同时登录的能力，但却被登录认证服务锁门外进不去了，索性只能联系供货商给我发了一份 exsi7 的系统装了上去。

还别说，exsi 确实相对好控制多了，系统炸了还能回滚，但这样一来虚拟机内部的 Win11 就不允许额外安装基于 WSL2 的 Docker 了，究其原因是 **exsi 已经用了一层虚拟化设施，虚拟化后的 CPU 内没办法再开一层虚拟化**。起初我在 exsi 里额外开了个 Debian 虚拟机，并在其中搭建了 Docker 服务。但是这种隔离开来的做法不太优雅，真要使用 Docker 就必须先切到 Debian 那边，源代码和配置文件也得从 Win11 这一侧同步过去，甚至因此有好几次出现了源代码 git 树修改不同步的问题。

为了能在 Win11 还像以前那样使用 Docker，我想到了一个折中的办法，那就是让本地的 Docker CLI 连接到 Debian 虚拟机中的 Docker 服务。这样一来，我就可以在 Win11 中使用 Docker 命令，而不必频繁切换到 Debian 虚拟机，顺带还能规避文件同步的问题。

话不多说，开整。

> **警告**：这种配置方法最好只在局域网环境中使用，直接将 Dockerd 的端口暴露到公网中是极其危险的行为，请务必注意至少准备必要的内外网隔离措施，包括且不限于配置防火墙规则、通过虚拟局域网组网而非物理局域网 IP 互相通信。

## 1. 修改 Docker 主机的配置

首先，我们需要确保 Debian 虚拟机中的 Docker 服务可以接受来自外部的连接，其实就是开一个 TCP 的连入监听通道。作为一种后台服务，dockerd 对外的通信手段无非是 IPC 和网络套接字，其中 IPC 走的是 Unix 套接字 `/var/run/docker.sock`，网络套接字则是通过 TCP/IP 协议进行通信。

> 某种意义上，自己写个 Docker CLI 还是很简单的，毕竟只要连进套接字、以 HTTP 协议通信就可以了。

这里有两种方案，一种是直接修改 Docker 的配置文件，另一种是通过 Docker 的命令行参数来实现。建议优先考虑前一种方法，前一种方法报错提示冲突时，再考虑后一种方法。

### 1.1. 修改 daemon.json 配置文件

我们需要修改 Docker 的配置文件，通常位于 `/etc/docker/daemon.json`。如果该文件不存在，可以手动创建一个。

运行 `sudo vim /etc/docker/daemon.json` 在 `daemon.json` 中添加以下内容：

```json
{
  "hosts": ["unix:///var/run/docker.sock", "tcp://0.0.0.0:2375"]
}
```

这段配置的意思是让 Docker 同时监听 Unix 套接字和 TCP 端口 2375。

修改完配置文件后，重启 Docker 服务使其生效：

```bash
sudo systemctl restart docker
```

### 1.2. 覆盖修改 systemctl 的配置文件

如果 systemctl 的配置文件中已经明确指定了 `-H` 参数，前一种修改 `daemon.json` 的方法就会报错，`dockerd` 无法同时使用命令行与配置文件输入的两种参数。这时候，我们还可以考虑干脆修改 systemctl 的配置文件。

在 Debian 系统中，Docker 的 systemd 服务文件通常位于 `/lib/systemd/system/docker.service`。

为了不影响原有服务的运行，我们可以创建一个 `override.service` 在 `/etc/systemd/system/docker.service.d/` 目录下：

```bash
sudo mkdir -p /etc/systemd/system/docker.service.d/
sudo vim /etc/systemd/system/docker.service.d/override.conf
```

在 `override.conf` 中添加以下内容：

```ini
[Service]
ExecStart=
ExecStart=/usr/bin/dockerd -H fd:// -H tcp://0.0.0.0:2375
```

> 这里的 `fd://` 默认指向 `unix:///var/run/docker.sock`。

保存并退出后，重新加载 systemd 配置并重启 Docker 服务：

```bash
sudo systemctl daemon-reload
sudo systemctl restart docker
```

> 再次提醒，记得配置好防火墙，开放局域网中的 2375 端口的准入连接；如果没整防火墙，就不用操心这个事情了
>
> 以 `ufw` 为例，可以使用以下命令：
>
> ```bash
> sudo ufw allow from <客户端的内网地址> to any port 2375
> ```
>
> 或者以 `iptables` 为例，可以使用以下命令：
>
> ```bash
> sudo iptables -A INPUT -p tcp -s <客户端的内网地址> --dport 2375 -j ACCEPT
> ```

## 2. 安装 Docker CLI 客户端

Win11 这一侧需要一个 Docker CLI 程序来提供 Docker 命令行相关的服务，但是目前 Docker Inc. 在其官网上只放了 Docker Desktop 的下载链接，而这么个玩意光是安装包就有差不多 1 GiB，而且很明显其中大部分用来自动配置 WSL2 的设施我们是用不到的。

这里有两种方案，一种是走官方偷偷藏起来的下载列表，直接下载 Docker CLI 的独立版本，这是[下载列表链接](https://download.docker.com/win/static/stable/x86_64)；另一种则是走 choco 之类的包管理工具进行安装。

我个人倾向于用后一种方案，主要还是图个方便。[这里贴一下 choco 的官方安装流程链接](https://chocolatey.org/install)。

然后，**以管理员模式**启动终端，运行以下命令安装 Docker CLI：

```bash
choco install docker-cli
choco install docker-compose
```

如果一切正常，输入 `y` 或者 `yes` 进行确认就可以安装了。

> 当然，如果你实在不想折腾，也可以直接使用 Docker Desktop。哪怕安装完之后没办法用本地 WSL2 也没关系，因为它连带着 Docker CLI 也给你安装好了，而位于 Win11 环境下的 Docker CLI 当然是功能正常的。

## 3. 配置 Docker CLI 客户端

下面，我们还需要给客户端配置远程连接的 URL，指向 Debian 虚拟机中的 Docker 服务。对于永久配置，我们可以通过 `docker context` 的一些命令做到。

首先，运行以下命令创建一个新的 Docker 上下文：

```bash
docker context create remote --docker "host=tcp://<Docker所在服务器的局域网IP>:2375"
```

可以通过这个命令来查看现在都有哪些上下文：

```bash
docker context ls
```

接下来，使用以下命令切换到刚刚创建的上下文：

```bash
docker context use remote
```

现在，你的 Docker CLI 就会通过 TCP 连接到 Debian 虚拟机中的 Docker 服务了。

可以尝试运行 `docker ps` 看看能不能和远程的 Docker 服务对的上号。

## 后记

其实，这篇笔记只讲了一半的操作流程，但另外一半本质上和 Docker 没啥关系。

另外一半是什么呢？是如何基于 Easytier 组个虚拟局域网。这几天高温假，如果我还有点空的话，考虑再写一篇 Easytier 的使用笔记。这个工具我用了得有两三个月了，比别的各种开源或商业竞品都好用太多了，它值得我花时间专门写一篇。

这几个月下来有太多工程笔记没来得及写，实验室真的太忙了，也就这会儿我好歹能稍微写一写。Orz

先这样吧，该文章同时同步在我的个人博客和论坛里。
