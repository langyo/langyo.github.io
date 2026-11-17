# AGENTS.md — langyo.github.io 仓库规则

> 面向在本仓库工作的 AI agent 与人类协作者。与 README / CONTRIBUTING 冲突时以本文件为准；
> 设计决策写进 PR 描述，不另建设计文档。

## 1. 定位

- 站点 `langyo.xyz`：Zola 0.21 + 自研主题 `themes/hikari-zola`（Tera/SCSS/原生 ES module，零外部运行时依赖）。
- 设计语言：明日方舟扁平 HUD × 蔚蓝档案千禧年（白 + 浅蓝）；hero 右侧是缓慢旋转的自研 WebGL2 点云电磁炮 RG·SUPERNOVA（主角天童爱丽丝）。
- 一切产物由 `zola build` 输出到 `public/`；运行时不得请求外部资源（见 §6）。

## 2. 目录结构

```text
config.toml         站点配置（theme = "hikari-zola"）
content/            _index.md、about.md、posts/*.md
assets/source/      原始素材（大图/裁切前原图），不参与构建、不发布
static/             发布用资源：static/img/ 派生图 + favicon
data/github.json    首页活动面板快照（脚本生成，禁止手改）
scripts/            零依赖 Python 工具
themes/hikari-zola/ 主题本体
.just/              celestia-devtools 暂存文件，gitignored，不入库
public/ _build/     构建产物，gitignored
```

## 3. 主题结构

```text
themes/hikari-zola/
  theme.toml        主题元数据
  templates/        Tera：base.html + index/section/page/about/404/taxonomy_*
    partials/       head / nav / footer / backdrop / toc
  sass/
    style.scss      唯一入口
    hk/             站点层：_palette / _base / 组件样式
    vendor/hikari/  hikari 官方 token 逐字副本（禁止手改，见 §6）
  static/js/        原生 ES module：main.js + rail/prefs/nav/reveal/toc/copy
    backdrop/       WebGL2 全息点云电磁炮 RG·SUPERNOVA（独立预算 34KB）
  static/img/       主题装饰图
```

职责：`templates/` 只输出契约 `hk-` 类名与 DOM；`sass/` 只消费 token；`static/js/` 经 `data-hk-*` 挂载，异常 try/catch 不阻断。

## 4. 内容与 frontmatter

文章 `content/posts/*.md` 必备字段：

```toml
+++
title = "..."
date = 2024-05-01
description = "一句话摘要（<=80 汉字）"
[taxonomies]
tags = ["rust", "windows"]
[extra]
summary = "列表卡片摘要（可选，缺省用 description）"
toc = true
+++
```

- `description` 必填；`tags` 用小写英文 slug；历史标题/日期不改写。
- `about.md` 用 `template = "about.html"`，正文 h2 小节组织（自我介绍/技术/游戏/科幻/联系）。
- 每页恰好一个 h1（模板保证）。
- 站内链接写绝对路径（`/posts/`）；正文外链可自由引用。

## 5. 构建与验证

```console
just build                        # zola build -> public/
just serve                        # 本地预览（zola serve）
python scripts/check_site.py      # 静态门禁：死链/结构/预算/外链/CDN/图片重量
python scripts/check_site.py --ci # 严格模式：warning 也判失败
just verify                       # build + check_site --ci + internal link check + devtools init --check
```

- 并行作业用 `zola build -o _build/<组名> --force`（`_build/` 已 gitignore）。
- check_site 用 config.toml 的 base_url 判 host；`--base-url` 127.0.0.1 的产物会假死链，改 `--config` 指向仅改 base_url 的副本。
- 链接检查只跑内链：`zola check --skip-external-links`（正文引用外网，403/超时不可控）。
- 验收线：`zola build` 0 error / 0 warning、内链检查通过、`check_site --ci` 通过。
- **缓存**：模板给入口资源加构建期 `?v=`、模块间 import 也带固定版本号；容器里 `SERVER_CACHE_CONTROL_HEADERS=false`
  （否则 SWS 默认给资源一年缓存，Cloudflare 会一直发旧 CSS/JS）。改 JS/CSS 后若线上仍是旧内容，先查 `cf-cache-status`。
- **Pages 镜像**：`pages.yml` 用 `configure-pages` 的 base_url 构建；生产 `langyo.xyz` 走容器，origin 由 `dockerfile` 的 `ARG SITE_BASE_URL`（默认 `https://langyo.xyz`）决定，镜像名 `homepage`，服务器上 `homepage` 容器监听 3000。
- **镜像标签**：只用 `latest`，不打 `v1/v2/...` 之类的编号 tag；GitHub 上也不打 release/tag。

## 6. 样式纪律

- 类名只用契约 §4.9 的 `hk-` 清单；新增类先改契约再实现。例外仅 Zola/syntect 类（`z-*`、`language-*`）。
- token 只从 `sass/vendor/hikari/` 派生；vendor 由 `sync-hikari-tokens.py` 生成（provenance 头 + 逐字正文），禁止手改；覆盖只写 `sass/hk/`。
- 颜色只走 `--hk-*`/`--color-*`；禁硬编码色值、禁新品牌色。
- 不引 CDN / webfont / 图标库 / CSS 框架；字体只用系统栈；阴影只用于浮层。
- 动效使用 `--duration-*` / `--ease-*` token，必须尊重 `prefers-reduced-motion`；暗色走 `html[data-theme="dark"]`。
- 预算：`style.css` <= 96KB（gzip <= 13KB——gzip 是实际约束）、JS（不含 backdrop）<= 15KB、backdrop <= 34KB、单图 <= 300KB。
  常量集中在 `scripts/check_site.py` 头部（`BUDGET_*`），每次运行打印实测值（含 gzip 与图片总重/最大单图）；
  发布产物里任何 >300KB 的图片文件都算 error。

## 7. 分支与提交

- `master` 只走 squash PR；禁直接 push、禁 merge commit、禁 `dev` 分支。
- 提交信息：gitmoji + 大写英文陈述句（如 `✨ Add ... .`），commit-msg hook 强制。
- 禁 `CHANGELOG.md`；设计与决策写 PR 描述；每个 commit 带 `Signed-off-by`（`git commit -s`）。
- 一个 PR 一个主题；合并前跑 `just verify` 并贴证据。

## 8. devtools 基建

- 首次检出：`just fetch` → `just ensure` → `celestia-devtools init --with-workflows`（hook + 三个 canonical caller）。
- 漂移门禁：`init --check`（CI 中 advisory，只告警）。
- 共享 recipes 由 `.just/` 提供（含 `fetch`）；不要重定义 `fetch`，否则 `init --check` 判失败。
- 三个 canonical caller 由生成器逐字节产出，禁止手改；升级用 `init --with-workflows --force`。

## 9. 资产流程

- `assets/source/` 原始素材（**不参与构建、不发布**）；`static/img/` 只放发布用派生图（webp）；主题装饰图放 `themes/hikari-zola/static/img/`。
- 派生图由 `scripts/assets/prepare_art.py` 生成：`alice-badge.webp`（dossier 头像）、`arona-side.webp`（装饰）及 svg 记号；hero 无人物图，原始素材留 `assets/source/` 不发布。
- 一律 webp、单图 <= 300KB（`check_site.py` 扫描发布产物，超限即 error）；模板必须写死 `width`/`height`；
  装饰图 `alt=""`，信息图配可读 alt。
- 改图/迁移后重跑 `just art` + `just verify`；迁移须同步模板引用（死链由 `check_site.py` 抓），PR 附对比。

## 10. GitHub 活跃度数据

- `data/github.json`：首页「活动」面板快照（schema v4），`scripts/github_stats.py` 生成，**禁止手改**；`top_repos[]` 仅存 `{name,stars,lang,url,private}`。
- **统计口径**：仓库类数据（repos/stars/langs/top_repos）取 **celestia-island 组织**；
  profile 与贡献日历（contributions/days/streak）取个人 viewer（个人贡献已含对组织仓库的提交）。
- 隐私：私仓名已获批准，可在「仓库」列表展示（带 PRI 标签）；禁止写私仓描述、私有贡献明细、star 以外的私仓元数据。
- 本地：`GITHUB_TOKEN=$(gh auth token) just sync-github`；`just github-check` 只校验不写。私仓口径需 secret `GH_STATS_TOKEN`（classic `repo`+`read:user`+`read:org`——组织私有仓也要能读；fine-grained 需对 celestia-island 组织仓库授权 + Metadata read）；未配置回退 `github.token`、降级 public 且不覆盖已有 all 快照（脚本拒绝降级；workflow 透传退出码，summary 打 `private scope: yes/no`）。
- CI：`github-stats.yml` 每日 03:17 UTC + dispatch；有变更则更新 `chore/github-stats` 并创建/更新 base=master 的 PR（`🔄 Sync the GitHub activity snapshot.`），不 push master，走 squash PR。
- 构建只读快照、不联网；抓取失败保留上一版；schema 变更与模板同 PR；GITHUB_TOKEN 推的分支不触发下游 workflow，快照 PR 的 checks 手动 dispatch。

## 11. 协作红线（给 agent）

- 只改任务声明的文件范围；不运行 `git add/commit/push/branch`，提交由 lead/人类统一执行。
- 不删他人临时文件；发现异常先报 lead。
- 产物与 `.just/` 不进库；契约冲突先问，不自行改契约。