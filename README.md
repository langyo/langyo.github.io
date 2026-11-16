# langyo.github.io

> 伊欧（langyo）的个人站点：基于 [Zola](https://www.getzola.org) 0.21 与自研主题
> `hikari-zola` 的静态站点。线上地址 <https://langyo.xyz>。

站点用 Tera 模板、SCSS 与原生 ES module 构建，**零外部运行时依赖**：没有 CDN、没有
webfont、没有前端框架。页面的视觉参考明日方舟的扁平 HUD 界面与蔚蓝档案千禧年的
白 + 浅蓝科技感，主角是天童爱丽丝；hero 右侧的全息投影舱里悬浮着一台缓慢旋转的自研
WebGL2 点云电磁炮 —— RG·SUPERNOVA。

## 功能

- 文章归档与标签：按年份时间线的记录、标签页与 Atom feed。
- 操作员档案 `/about/`：frontmatter 驱动的 dossier 页面（属性条 / 技能 / 履历）。
- 全息电磁炮 hero：可拖拽转台的 WebGL2 点云投影舱 + HUD 读数。
- **首页 GitHub 活动面板**：读取 `data/github.json` 快照（每日由 CI 自动提 PR 刷新），
  构建与访问都不发起第三方请求。
- 明暗主题、响应式、`prefers-reduced-motion`；零 JS 也可读，仅系统字体 + 原生 ES module。

## 设计

- **明日方舟**：扁平、硬边、发丝线分层；mono 大写微标签、`//` 前缀、编号、切角卡片、
  四角括号框、扫描线暗示、单调的 HUD 读数。
- **蔚蓝档案 · 千禧年**：白底 + 浅蓝强调色、干净的科技感；浅蓝取自爱丽丝的瞳色与发色。
- **hikari 设计 token**：间距 / 字号 / 圆角 / 动效 / 通道色全部来自
  [`@celestia-island/hikari`](https://github.com/celestia-island/hikari)，逐字 vendored 到
  `themes/hikari-zola/sass/vendor/hikari/` 并带 provenance 头；站点色板只在其上覆盖，
  不引入第二个设计体系。
- **全息点云电磁炮 RG·SUPERNOVA**：纯 WebGL2 + 程序化点云（无 three.js），青色线框 + 稀疏
  面点 + 琥珀电容器，像全息投影/扫描仪而不是实心模型；绕 Y 轴缓慢 360° 旋转，叠加固定倾斜
  与鼠标/滚动视差，明暗两套配色，`prefers-reduced-motion` 下只渲染首帧，无 WebGL2 时静默
  降级为 CSS 底纹。hero 不再放人像，右侧由全息电磁炮承担。

## 技术栈

| 层 | 选型 |
|---|---|
| 站点生成 | Zola 0.21（Tera 模板、内置 Sass 编译、Atom/RSS、sitemap） |
| 样式 | SCSS：hikari token 层 + 站点 `hk-` 组件层 |
| 脚本 | 原生 ES module（无构建、无依赖、ES2020） |
| 背景 | 自研 WebGL2 点云全息渲染器（电磁炮 RG·SUPERNOVA） |
| CI/CD | GitHub Actions（Pages 部署 + PR 静态门禁） |
| 容器 | 多阶段 dockerfile：Zola 构建 + static-web-server 托管 `public/` |

## 本地开发

依赖：Zola **0.21.0**、Python **3.11+**（脚本只用标准库）、[just](https://just.systems)（可选，
用于统一入口）、celestia-devtools（可选，用于基建漂移检查）。

```console
# 构建与预览
just build            # zola build -> public/
just serve            # zola serve（本地预览，热重载）

# 等价的原生命令
zola build
zola serve

# 静态质量门禁：死链 / 每页 h1 / img 尺寸 / 外链与 CDN / 体积预算 / 暗色与动效选择器
python scripts/check_site.py
python scripts/check_site.py --ci   # 严格模式（warning 也判失败）

# 完整本地门禁：build + check_site + 内链检查 + devtools 漂移检查
just verify
```

首次检出时暂存共享 devtools recipes 并安装 commit-msg hook：

```console
just fetch                                # 写入 gitignored 的 .just/celestia-devtools.just
celestia-devtools init --with-workflows   # hook + 三个 canonical caller workflow
celestia-devtools init --check            # 漂移检查（CI 中为 advisory）
```

设计 token 需要重新同步时：

```console
just sync-hikari-tokens                              # 从 npm registry 拉最新版
just sync-hikari-tokens --from ../hikari/packages/vue # 离线：从本地 hikari 检出同步
just sync-hikari-tokens --check                      # 只检查是否漂移，不写文件
```

GitHub 活动快照（首页面板数据）需要手动刷新时：

```console
just sync-github     # 抓取并写 data/github.json（需要 GitHub token 与网络）
just github-check    # 只检查快照是否存在且最新，不写文件
```

> CI 每日 03:17 UTC 自动抓取并提 PR（分支 `chore/github-stats`，base master），
> 构建与访问只读 `data/github.json` 快照、不发起第三方请求。

> **base_url 提示**：`check_site.py` 用 `config.toml` 的 `base_url` 判断本站 host，
> 所以 `zola build --base-url http://127.0.0.1:PORT` 的本地产物直接跑会报大量假死链。
> 要么对使用默认 `base_url` 的“基准构建”跑检查，要么把 `--config` 指向仅改
> `base_url` 的副本（`python scripts/check_site.py --config /tmp/config.local.toml`）。

### 图片与资产

- `assets/source/`：原始素材（大图、裁切前原图、设计稿），**不参与构建、不发布**。
- `static/img/`：发布用派生图（webp）：`alice-badge.webp`（400×400 dossier 头像）、
  `arona-side.webp`（about/404 装饰）及自绘 svg 记号；主题装饰图在 `themes/hikari-zola/static/img/`。
  hero 不再生成人像图，右侧由全息点云电磁炮承担。
- `scripts/assets/prepare_art.py` 从 `assets/source/` 生成派生图（`just art`）；单图 <= 300 KB，
  模板写死 `width`/`height`。`check_site.py` 扫描发布产物：单张 >300 KiB 记 error，
  并在汇总里打印图片总重与最大单图。

## 目录结构

```text
langyo.github.io/
├── config.toml              Zola 站点配置（theme = "hikari-zola"）
├── content/                 内容：首页、关于页、posts/*.md
├── assets/source/           原始素材（大图 / 裁切前原图），不参与构建、不发布
├── static/                  发布用资源：static/img/ 派生图 + favicon（原样拷贝）
├── data/
│   └── github.json          首页 GitHub 活动面板快照（脚本生成，勿手改）
├── scripts/                 零第三方依赖的 Python 工具
│   ├── check_site.py        构建产物静态门禁
│   ├── sync-hikari-tokens.py hikari token vendoring 同步
│   ├── github_stats.py      GitHub 活动快照抓取（just sync-github / github-check）
│   └── assets/              图片处理管线
├── themes/hikari-zola/      自研主题
│   ├── templates/           Tera 模板与 partials
│   ├── sass/                style.scss + hk/ 站点层 + vendor/hikari token
│   └── static/              js（含 backdrop/）与主题装饰图
├── .github/workflows/       pages.yml（部署）、checks.yml（PR 门禁）、github-stats.yml（每日快照 PR）+ canonical callers
├── dockerfile               Zola 构建 + static-web-server
├── justfile                 统一入口（import 共享 devtools recipes）
└── AGENTS.md                仓库级协作与实现规则
```

## 部署

**GitHub Pages（生产）**：`.github/workflows/pages.yml` 在 `master` push 或手动
`workflow_dispatch` 时触发：checkout → 下载 Zola 0.21.0 Linux 二进制 → `zola build` →
`actions/configure-pages` + `upload-pages-artifact`（`public/`）→ `deploy-pages`。
仓库 Pages 的 Source 需设为「GitHub Actions」；自定义域名由 Pages 设置管理。

**PR 门禁**：`.github/workflows/checks.yml` 在 pull request 上跑 `zola build` +
`python3 scripts/check_site.py`，并尝试安装 celestia-devtools 执行 `init --check`
（装不上或漂移只告警，不阻断）。

**容器（可选）**：`dockerfile` 用 `ghcr.io/getzola/zola:v0.21.0` 构建，产物交给
`static-web-server` 托管。推送到个人镜像仓库：

```console
just publish          # 默认 podman
just publish docker   # 使用 docker
```

镜像地址 `crpi-88d7shkt0yo9qvvt.cn-shanghai.personal.cr.aliyuncs.com/langyo_personal/homepage`。

## 设计来源与致谢

- [hikari](https://github.com/celestia-island/hikari) — celestia-island 的设计系统；本主题的
  通道色、scale 层与 reset/selection/scrollbar/highlight 均逐字 vendored（保留 provenance）。
- [tairitsu](https://github.com/celestia-island/tairitsu) — 生态中的全栈框架，hikari 的打包与
  站点基建伙伴；本仓库的工程规范与之一致。
- 《明日方舟》 — 扁平 HUD、几何符号、mono 微标签的视觉语言来源。
- 《蔚蓝档案》 — 千禧年学园的白 + 浅蓝配色与天童爱丽丝的角色意象来源。
- [Zola](https://github.com/getzola/zola) — 静态站生成器。

> 本站是个人非商业同人向站点。角色形象与相关作品版权归原权利方所有；站内角色图仅作
> 装饰，不用于任何商业用途。

## 许可证

本仓库采用**双轨**许可：

- **代码**（Tera 模板、SCSS、JavaScript、Python 脚本、构建配置、CI 定义）：
  [**SySL-1.0**](LICENSE)（Synthetic Source License 1.0）—— 授予永久的版权与专利许可，
  仅保留 AI 生成披露等披露义务。
- **站点内容**（文章、图片、文案）：**CC BY-NC 4.0**
  （[Creative Commons Attribution-NonCommercial 4.0](https://creativecommons.org/licenses/by-nc/4.0/)）
  —— 署名、非商业使用。

第三方资产：hikari token 归 celestia-island（SySL-1.0）；Zola 为 MIT；
《明日方舟》《蔚蓝档案》的角色与美术版权归各自权利方。

本项目大量使用 AI 协作开发，提交信息与文件头按 SySL-1.0 第 2.3 节披露 AI 参与情况。