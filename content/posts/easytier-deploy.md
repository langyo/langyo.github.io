+++
title="以 Easytier 部署虚拟局域网服务的流程"
date=2025-08-11
draft=false
+++

几个月前，我头一回听说 Easytier，一听是哪位北航大的老哥用 Rust 写的，我就尝试用了一下，意外觉得很好用。

现在，我已经用这个工具给我手里和实验室的设备组建了相对还算完整的虚拟局域网，让我得以在外出差或者假期在家时，也能随时连回实验室内网的工作站继续干活。~~社畜本色暴露了，哈哈~~

下面简单讲一讲 Easytier 官网上没写明白的很多细节流程，也算是我对这段时间就组网这块踩坑的总结。

> 本文需要读者具备一定的计科基础知识，了解基本的计算机网络架构和具备基础的 Linux 终端操作能力。如果确实碰到有一些难以理解的地方，请先考虑询问具备联网搜索能力的 AI 问答服务。
>
> **本文可以跳着看**。对于只是想体验 Easytier 的用户，可以直接参考**第 1 节的安装部分**和**第 4 节的官网接入部分**的内容。

## 1. 部署公网 Easytier 节点

> **这一步是可选的。如果仅想测试体验，或是没有条件搭建服务端，可以直接使用[社区提供的公用节点](https://easytier.gd.nkbpal.cn/status/easytier)。**
>
> 仅建议在企业场景等架设自己的主节点，如果是个人玩一玩，大可以拿公用节点先用着，而且可用的公用节点还挺多。
>
> 另外，该步骤的官网参考步骤[在这里](https://easytier.cn/guide/installation.html)。

由于 NAT 的存在，一般我们手里的设备接入的网络都是不具备公网 IP 的，这就导致我们无法直接将设备暴露在互联网上。为了解决这个问题，我们需要在云端或其他具有公网 IP 的服务器上部署一个 Easytier 节点，以此实现不同内网间设备之间的互相感知。

在正式开始之前，我们需要一台拥有公网 IP 的服务器，建议使用包含了 Docker 服务的 Linux 系统。

> 不推荐在 Windows 上部署对外公网 Easytier 节点，因为 Windows 的网络防火墙配置更复杂，并且一般不支持基于 Docker 的容器化部署，总之就是非常费事。

### 1.1. 本地安装方案

如果你的这台机器的网络环境不那么复杂，并且希望能简单安装，可以优先考虑这个方案。

以 Debian / Ubuntu 为例，在 `root` 用户权限下进入服务器的远程终端。对于中国大陆的网络环境，可以使用以下命令来一键安装：

```bash
apt update
apt install unzip -y
wget -O /tmp/easytier.sh "https://ghfast.top/https://raw.githubusercontent.com/EasyTier/EasyTier/main/script/install.sh" && sudo bash /tmp/easytier.sh install --gh-proxy https://ghfast.top/
```

如果网络环境不受限制，可以使用以下命令：

```bash
apt update
apt install unzip -y
wget -O /tmp/easytier.sh "https://raw.githubusercontent.com/EasyTier/EasyTier/main/script/install.sh" && sudo bash /tmp/easytier.sh install
```

Easytier 会作为一个 systemctl 服务安装到系统中，对应于 `/etc/systemd/system/easytier@.service`。

> `easytier@.service` 中的 `@` 符号表示这是一个模板服务，文件中的 `%i` 会被替换为具体的实例名称。例如，运行 `systemctl start easytier@<实例名称>` 即可启动对应的服务。

安装过后，我们可以打开由安装脚本默认提供的 `/opt/easytier/config/default.conf` 进行具体配置：

```conf
instance_name = "default" # 这里名字随便改，对应于 systemctl 的服务实例名称
ipv4 = "192.168.10.1" # 这里设定这个节点的静态 IP，必须在局域网号段中
# 如果想动态分配 IP 地址，可以改为使用下面这句
# dhcp = true
# 如果不希望这台机器具有 IP 地址，ipv4 和 dhcp 就都别配置
listeners = [
    "tcp://0.0.0.0:11010", # 监听端口配置，记得同时配置防火墙，需要进各家 VPS 的后台面板放行 11010 端口
    "udp://0.0.0.0:11010",
    "wg://0.0.0.0:11011",
]
rpc_portal = "0.0.0.0:0"
hostname = "在虚拟局域网中的标识主机英文名" # 可选，不填的话默认为该机器的真实登录用户名

[network_identity]
network_name = "网络名称，自己随便取一个英文名"
network_secret = "网络密码，留空则为直接允许任何人加入网络"
```

> 注意这里的 `instance_name` 的值就是这个配置的实例名称。如果要启动这个配置文件的服务，就运行 `systemctl start easytier@default`，也就是 `@` 后面换成对应的实例名称。

通过 `vim /opt/easytier/config/default.conf` 打开配置文件进行编辑，之后我们需要在 `sudo` 权限下运行：

```bash
systemctl daemon-reload # 刷新服务配置
systemctl enable easytier@default # 启用
systemctl start easytier@default # 启动，注意必须先启用才能启动

systemctl status easytier@default # 查看服务运行状态，如果正常应该能看到绿字的 active (running)

# 如果需要停止与停用服务，按顺序执行以下命令
systemctl stop easytier@default # 停止
systemctl disable easytier@default # 禁用

# 如果修改了服务配置文件，需要重启，按顺序执行以下命令
systemctl daemon-reload # 刷新服务配置
systemctl restart easytier@default # 重启
```

> [这里还有另一种手动安装服务的方案](https://easytier.cn/guide/network/oneclick-install-as-service.html)，需要你自行上载 Easytier 的那几个可执行文件。其中 `easytier-cli` 自身是有能创建服务的能力的。这种方案适用于外网隔绝、但是防火墙开了口子到指定外网 IP 的情况，如涉密网络环境的虚拟局域网部署等。

### 1.2. Docker 安装方案

如果你的这台机器同时兼职跑着别的一些服务，不希望 Easytier 可能会影响其它服务的运行，可以优先考虑这个方案。

> 如果机器还没安装过 Docker，我建议使用这个[一键安装脚本](https://linuxmirrors.cn/#docker)，在安装后还能顺带帮你把镜像源也配置了。
>
> 请注意，`docker` 指令的执行可能需要 `sudo` 权限。

找一处合适的目录，创建一个 Docker Compose 配置文件。这里以 `vim /home/easytier.yml` 为例：

```yaml
services:
  easytier:
    image: m.daocloud.io/docker.io/easytier/easytier:latest
    # 如果网络环境不受限制，可以考虑将上一行的内容修改为下面这一行
    # image: easytier/easytier:latest
    hostname: easytier
    container_name: easytier
    restart: unless-stopped
    network_mode: host
    cap_add:
      - NET_ADMIN
      - NET_RAW
    environment:
      - TZ=Asia/Shanghai
    devices:
      - /dev/net/tun:/dev/net/tun # 建议使用，用于映射宿主机 tun 设备到本地，相当于模拟一个三级交换机，以拦截处理局域网地址
    volumes:
      - /etc/easytier:/root # 可选，用于在 Docker 容器外部也能使用 Easytier 的命令行
      - /etc/machine-id:/etc/machine-id:ro # 便于 Easytier 读取宿主机的真实主机名
    command: -i "这台机器的静态 IP 地址" --network-name "网络名称，自己随便取一个英文名" --network-secret "网络密码，不加这句参数则为准许任何人加入网络" -l 11010
    # 如果不需要这台机器有静态 IP 地址，以上的 -i "xxx" 可以换成 -d，以分配动态 IP 地址；或者干脆不写，这台机器就不分配具体地址
    # 如果需要指定自定义主机名，可以补充参数 --hostname "自定义英文主机名"
```

其中，`-i` 参数用于指定这台机器的静态 IP 地址，`--network-name` 和 `--network-secret` 分别用于指定网络名称和网络密码，最后的 `-l` 参数用于指定监听端口（即 11010，同时监听 TCP 与 UDP）。

然后运行以下命令启动 Docker 容器：

```bash
docker compose -f /home/easytier.yml up -d
```

如果有需要，可以运行以下命令停止并清理 Docker 容器，不留痕迹：

```bash
docker compose -f /home/easytier.yml down
```

### 1.3. 域名配置建议

强烈建议给第一个公网 IP 的主机配置一个域名，这样后续如果有更换主机的需求，就不用动原本组网的机器的配置了。

> 虽说如此，如果你使用了诸如 Cloudflare 等**具备反代保护**的 DNS 提供商，请记得关闭 DNS 代理，因为这些代理所在的主机位置反而可能会影响 Easytier 组网，副作用包括且不限于连接延迟更高、被墙风险增加等。

## 2. 入网设备配置 Easytier

Easytier 的组网方式是去中心化的，只要与其中一个节点握上手，这个子网下的其它所有设备就都可以探知到。因此，配置一个 Easytier 的“服务端”与“客户端”的步骤是没什么区别的，唯一区别是谁先配置、充当第一个公网主机，其余的设备只要连上这个主机就可以了。

### 2.1. 为 Linux 主机配置 Easytier

在 Linux 主机上安装 Easytier 的步骤与前文其实是差不多的，区别在于配置内容。

对于前文 1.1 的方案，举个例子，配置文件可以这么改：

```conf
instance_name = "default" # 这里名字随便改，对应于 systemctl 的服务实例名称
ipv4 = "192.168.10.2" # 这里设定这个节点的静态 IP，道理和前面也是类似的，注意别和已有主机搞重复了
rpc_portal = "0.0.0.0:0"
hostname = "在虚拟局域网中的标识主机英文名" # 可选，不填的话默认为该机器的真实登录用户名

[[peer]]
uri = "tcp://<第一个公网 IP 主机的公网 IP 或域名>:11010"

# 可选，如果觉得网络环境可能不够稳定，再加一个 UDP 就相当于上个保险
[[peer]]
uri = "udp://<第一个公网 IP 主机的公网 IP 或域名>:11010"

[network_identity]
network_name = "网络名称，需要跟随第一个主机的名称"
network_secret = "网络密码，也是需要跟随第一个主机的配置，如有就得对上号"
```

除了修改 IP 地址以外，主要修改就是增加了个 `[[peer]]` 段落，用于指定用于并网的公网主机的地址，可以指定多个不同的主机地址，也可以分别指定不同协议的同一地址。

对于前文 1.2 的方案，命令行部分则改为这样：

```bash
-i <这台机器的静态 IP 地址> --network-name <网络名称，自己随便取一个英文名> --network-secret <网络密码，不加这句参数则为准许任何人加入网络> -p tcp://<第一个公网 IP 主机的公网 IP 或域名>:11010 -p udp://<第一个公网 IP 主机的公网 IP 或域名>:11010
```

除了前文讲过的部分外，`-p` 参数用于指定用于并网的公网主机的地址，和前面那个 `[[peer]]` 段落中的 `uri` 是对应的关系，也是可以多次书写。

### 2.2. 为 Windows 主机配置临时 Easytier

Easytier 官方提供了一个名为 Easytier GUI 的程序，[在这里下载](https://easytier.cn/guide/download.html)。如果前文都认真阅读了的话，其实这个软件我是不必专门讲解如何使用的，[参考官方文档即可](https://easytier.cn/guide/gui/manual.html)。

这里唯一需要注意的坑，是高级配置选项中有一个“无 TUN 模式”。除非你这个主机是铁定了只接受外部连入、自己不主动连出的，否则这个选项就**不要**勾选上。前面我说过，TUN 是作为一个虚拟的三级交换机帮你拦截处理局域网地址请求的，如果没有它，从本机向虚拟局域网的地址发起的请求就没人能处理了。

### 2.3. 为 Windows 主机配置开机启动的 Easytier 服务

这里的操作主要也可以参考官方文档，并且有两种方式。一种是[直接使用官方脚本自动安装配置](https://easytier.cn/guide/network/oneclick-install-as-service.html)，另一种则是[手动下载 Easytier 的可执行文件再用 nssm 配置服务](https://easytier.cn/guide/network/install-as-a-windows-service.html)。

老实说，其实后一种方法没太大必要，因为 `easytier-cli` 已经自带了在各个操作系统下自动创建系统服务的能力，这一点前文 1.1 就有提及。

把下载好的 Easytier 可执行文件解压到一个合适的目录下，举个例子，这里我们就解压到 `C:\easytier`。

打开管理员模式的终端，然后运行以下命令，以安装服务：

```powershell
.\easytier-cli.exe service install `
    --description "自定义服务描述" `    # 可选，默认使用包描述
    --display-name "显示名称" `    # 可选，服务显示名称
    # --disable-autostart `    # 可选，禁用开机自启（默认启用）
    -- `  # 以下开始就都是和前面 1.2 一样的传递参数格式了
    --hostname "在虚拟局域网中的标识主机英文名" -i "这台机器的静态 IP 地址" `
    --network-name "网络名称，自己随便取一个英文名" --network-secret "网络密码，不加这句参数则为准许任何人加入网络" `
    -p tcp://<第一个公网 IP 主机的公网 IP 或域名>:11010 -p udp://<第一个公网 IP 主机的公网 IP 或域名>:11010
```

然后使用以下命令启动服务：

```powershell
.\easytier-cli.exe service start
```

如有需要，使用以下命令停止服务：

```powershell
.\easytier-cli.exe service stop
```

> 在我实际测试中，如果出现诸如笔记本电脑盒盖等行为导致的系统进入睡眠，重新唤醒后就可能需要手动重启服务。
>
> 除非需要修改连接参数，重启服务不需要重新安装服务。

如果需要卸载服务，可以使用以下命令：

```powershell
.\easytier-cli.exe service uninstall
```

## 3. 进阶配置：CIDR 映射

在一些使用场景中，可能不仅需要连接虚拟局域网中的各个主机，还需要将某些特定的 IP 地址段映射到虚拟局域网中。这时可以使用 CIDR 映射功能。

这里我举个实践过的例子，我的虚拟局域网部署的 IP 地址均位于 `192.168.10.*` 段内，而我的实验室仪器的内网地址可能有 `192.168.15.1` 和 `192.168.18.*`。我希望能将 `192.168.15.1` 按原样映射，`192.168.18.*` 则映射到 `192.168.11.*` 段内。直观来看，是这么个映射：

```text
源主机网络        发起连接的主机网络
192.168.15.1 -> 192.168.15.1
192.168.18.* -> 192.168.11.*
```

这里同样是有两种方案。如果是以配置文件的形式，可以这样添加 CIDR 映射：

```conf
[[proxy_network]]
cidr = "192.168.15.1"
mapped_cidr = "192.168.15.1"

[[proxy_network]]
cidr = "192.168.18.0/24"
mapped_cidr = "192.168.11.0/24"
```

> 这里的 `/24` 是 CIDR 表示法中的子网掩码，表示前 24 位是网络地址，后 8 位是主机地址。

如果是以命令行配置的形式，则是这么添加的：

```bash
-n "192.168.15.1" -n "192.168.18.0/24->192.168.11.0/24"
```

> 如果源地址和目标地址相同，可以省略重复的部分和箭头，写一次就行。

## 4. 统筹协调：Web 控制台

由于 Easytier 是一个分布式的虚拟局域网解决方案，因此如果直接用上述的方法组网，各个入网的主机之间是**没有权限**相互踢掉对方的。

为此，Easytier 还提供了一个 Web 控制台，可以方便地管理和监控虚拟局域网中的各个主机。这对于实时动态配置与管理的场景非常有用。

### 4.1. 直接使用官网控制台

最简便也最快速的办法是使用官方的 Web 控制台。请先[在这里注册账号](https://easytier.cn/web#/auth/register)。

> 如果信不过，可以直接考虑用下一节的自行部署方案。

注册并登录后，可以看到控制台里设备数量暂时为 0 个，毕竟刚注册嘛。下面我们再配置要入网的主机，同样是两种做法。

如果是用的 Docker Compose，就直接给 `command` 传递一个 `-w <注册时的用户名>` 就行：

```yaml
services:
  easytier:
    image: m.daocloud.io/docker.io/easytier/easytier:latest
    hostname: easytier
    container_name: easytier
    restart: unless-stopped
    network_mode: host
    cap_add:
      - NET_ADMIN
      - NET_RAW
    environment:
      - TZ=Asia/Shanghai
    devices:
      - /dev/net/tun:/dev/net/tun
    volumes:
      - /etc/easytier:/root
      - /etc/machine-id:/etc/machine-id:ro
    command: -w <注册时的用户名> --hostname <在虚拟局域网中的标识主机英文名>
```

如果是通过 `easytier-cli` 创建的服务，创建时也是只需要传个 `-w` 就行：

```bash
easytier-cli service install -- -w <注册时的用户名> --hostname <在虚拟局域网中的标识主机英文名>
```

> 如果使用 Web 控制台，就**用不了配置文件方案**，因为 Web 控制台本身就是分发配置文件的中心。
>
> 打比方就是，餐厅门口有个服务员（Web 控制台）给你发用餐券（配置文件），你就用不着在窗口单独点菜（单独写自己的配置文件）了，直接根据用餐券取对应的菜品就行。

### 4.2. 自行部署控制台

可能你信不过官网的控制台，毕竟光是注册只要个验证码这件事本身就让人觉得很不踏实，防不住有人滥用。

所以，为了隐私安全或是部署涉密局域网，我们也可以选择自行部署 Web 控制台，它的本体就在 Easytier 发布的二进制文件包中一个名为 `easytier-web-embed` 的程序中。

直接运行 `easytier-web-embed` 即可启动控制台。如果觉得可以开机启动，在 Linux 下可以考虑用 systemd 把它做成一个系统服务常驻在后台。创建 `/etc/systemd/system/easytier-web-embed.service` 文件，内容如下：

```ini
[Unit]
Description=Easytier Web Embed

[Service]
ExecStart=/home/easytier-web-embed  # 注意需要根据实际情况指向实际路径；如果忘记在哪里了，可以用 which easytier-web-embed 定位一下
Restart=always

[Install]
WantedBy=multi-user.target
```

这个服务端的 Web 控制台可以通过访问 `http://<配置服务器 IP>:11211` 来进行管理和监控，而如果想让别的节点连入这里，默认情况下还需要额外开放 `22020` 端口。注意提前放行防火墙。

注册一个管理员账号，登录后就可以着手做和前面一样的事情了，把节点一个个都塞进来。不同的是，`-w` 参数后面跟的参数就需要携带服务器地址了：

```bash
# 这里以 easytier-cli 注册流程举例，Docker Compose 配置文件同理，改一下 -w 后面的内容就行
easytier-cli service install -- -w tcp://<配置服务器 IP>:22020/<注册时的用户名>
```

这样就差不多了。

## 后记

本来还想提一嘴有些国内的中继 NAT 服务商的，这类 VPS 的 IP 不能直接被访问，但是因为在锥形 NAT 下，所以很容易被打洞。考虑到论坛不能直接涉及任何商业宣传，我在这里就先不具体提了。如有需要，大家可以沿着我说的这个文本，直接问联网 AI 都有什么运营商，也算是我避个嫌。

趁着高温假，连着写了两三天，写上头了，到现在才写好。其实 Easytier 按理说不止这点东西，还有很多可能一般大家用不上的功能，我就先不在这里提了，官方文档都有提到一些，再不济还可以直接去 Github 看具体实现，反正是开源的。

总之，就先这样，希望能帮到大家。该文章同时同步在我的个人博客和论坛里。
