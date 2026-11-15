# AGENTS.md — langyo.github.io 仓库规则

> 面向在本仓库工作的 AI agent 与人类协作者。与 README / CONTRIBUTING 冲突时以本文件为准；
> 设计决策写进 PR 描述，不另建设计文档。

## 1. 定位

- 站点 `langyo.xyz`：Zola 0.21 静态站 + 自研主题 `themes/hikari-zola`（Tera + SCSS + 原生 ES module，零外部运行时依赖）。
- 设计语言：明日方舟式扁平 HUD × 蔚蓝档案千禧年（白 + 浅蓝）；主角天童爱丽丝（浅蓝主色、剪影、3D 点云光之剑背景）。
- 一切页面/样式/脚本由 `zola build` 产出到 `public/`；页面运行时不得请求任何外部资源（CDN/webfont/图标库/统计脚本除外，见 §6）。

## 2. 目录结构

```text
config.toml         站点配置（theme = "hikari-zola"）
content/            _index.md、about.md、posts/*.md
assets/source/      原始素材（大图/裁切前原图），不参与构建、不发布
static/             发布用资源：static/img/ 派生图 + favicon（不放 js/css）
scripts/            零第三方依赖的 Python 工具（检查/同步/资产）
themes/hikari-zola/ 主题本体（templates/sass/static）
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
    style.scss      唯一入口（@use 各层）
    hk/             站点层：_palette / _base / 组件样式（可改）
    vendor/hikari/  hikari 官方 token 逐字副本（禁止手改，见 §6）
  static/js/        原生 ES module：main.js + prefs/nav/reveal/toc/copy
    backdrop/       WebGL2 点云光之剑（独立预算）
  static/img/       主题装饰图（内容组产出，其它组只读）
```

职责边界：`templates/` 只输出契约里的 `hk-` 类名与 DOM；`sass/` 只消费 `hk-`/token 变量；
`static/js/` 通过 `data-hk-*` 挂载，禁止 `innerHTML` 注入不可信内容，模块异常必须 try/catch 不阻断页面。

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

- `description` 必填（SEO 与卡片）；`tags` 用小写英文 slug；历史标题/日期不改写。
- `about.md` 用 `template = "about.html"`，正文按 h2 小节组织（自我介绍 / 技术版图 / 游戏与创作 / 科幻 / 联系）。
- 每页恰好一个 h1（模板保证；正文标题从 h2 起）。
- 站内链接写绝对路径（`/posts/`），不写 `https://langyo.xyz` 前缀；正文外链可自由引用权威资料。

## 5. 构建与验证

```console
just build                        # zola build -> public/
just serve                        # 本地预览（zola serve）
python scripts/check_site.py      # 静态门禁：死链/结构/预算/外链/CDN/图片重量
python scripts/check_site.py --ci # 严格模式：warning 也判失败
just verify                       # build + check_site --ci + internal link check + devtools init --check
```

- 并行作业用独立输出目录：`zola build -o _build/<组名> --force`（`_build/` 已 gitignore）。
- check_site 用 `config.toml` 的 `base_url` 判本站 host：`zola build --base-url http://127.0.0.1:PORT`
  的产物直接跑会满屏假死链。要么用默认 base_url 的“基准构建”，要么 `--config` 指向仅改 base_url 的副本。
- 链接检查只跑内链：`zola check --skip-external-links`（正文引用外网，403/超时不可控，不因此失败）。
- 验收线：`zola build` 0 error / 0 warning、内链检查通过、`check_site --ci` 通过。

## 6. 样式纪律

- 类名只用契约 §4.9 的 `hk-` 清单；新增类必须先改契约（PR 描述）再实现。允许的例外仅 Zola/syntect 类（`z-*`、`language-*`）。
- token 只从 `sass/vendor/hikari/` 派生：vendor 文件由 `scripts/sync-hikari-tokens.py` 生成（3 行 provenance 头 + 逐字正文），禁止手改；站点覆盖只写 `sass/hk/`。
- 颜色只走 `--hk-*` / `--color-*` 变量，禁止硬编码色值、禁止引入新品牌色。
- 不引 CDN / webfont / 图标库 / CSS 框架；字体只用系统栈；阴影只用于浮层。
- 动效使用 `--duration-*` / `--ease-*` token，必须尊重 `prefers-reduced-motion`；暗色走 `html[data-theme="dark"]`。
- 预算：`style.css` <= 64KB（gzip <= 12KB）、JS（不含 backdrop）<= 14KB、backdrop <= 22KB、单图 <= 300KB。
  常量集中在 `scripts/check_site.py` 头部（`BUDGET_*`），每次运行打印实测值（含 gzip 与图片总重/最大单图）；
  发布产物里任何 >300KB 的图片文件都算 error。

## 7. 分支与提交

- `master` 只通过 squash PR 合入；禁止直接 push master、禁止 merge commit、禁止 `dev` 分支。
- 提交信息：gitmoji + 大写英文陈述句（例如 `✨ Add hikari-zola theme skeleton.`），由 commit-msg hook 强制。
- 禁 `CHANGELOG.md`；设计与决策写 PR 描述；每个 commit 带 `Signed-off-by`（`git commit -s`）。
- 一个 PR 一个主题；合并前必须本地跑 `just verify` 并在 PR 里贴证据。

## 8. devtools 基建

- 首次检出：`just fetch`（暂存 `.just/celestia-devtools.just`）→ `just ensure`（装 CLI）→ `celestia-devtools init --with-workflows`（装 commit-msg hook + 生成三个 canonical caller）。
- 漂移门禁：`celestia-devtools init --check`（CI 的 `checks.yml` 里为 advisory，失败只告警）。
- 共享 recipes 由 `.just/celestia-devtools.just` 提供（含 `fetch`）；**不要**在本仓 justfile 重定义 `fetch`，否则 `init --check` 直接判失败。
- 三个 canonical caller（`commit-msg-lint.yml` / `ci-cache.yml` / `pr-title-check.yml`）由生成器逐字节产出，禁止手改；升级用 `celestia-devtools init --with-workflows --force`。

## 9. 资产流程

- 分层：`assets/source/` 放原始素材（大图、裁切前原图、设计稿），**不参与构建、不发布**；
  `static/img/` 只放发布用派生图（webp）；主题装饰图放 `themes/hikari-zola/static/img/`。不放 js/css。
- 派生图由 `scripts/assets/prepare_art.py` 从 `assets/source/` 生成到 `static/img/`：
  `alice-hero.webp`（900×1120 竖构图）、`alice-badge.webp`（400×400）、`arona-side.webp` 及自绘 svg 记号。
- 一律 webp、单图 <= 300KB（`check_site.py` 扫描发布产物，超限即 error）；模板必须写死 `width`/`height`；
  装饰图 `alt=""`，信息图配可读 alt。
- 迁移素材/改图后重跑 `just art` + `just verify`；迁移必须同步模板引用，死链由 `check_site.py` 抓；
  PR 描述附前后对比与体积。

## 10. 协作红线（给 agent）

- 只改任务声明的文件范围；不运行 `git add/commit/push/branch`，提交由 lead/人类统一执行。
- 不删别人的临时文件；发现异常先报告 lead，不擅自“修好”他人 scope。
- 构建产物与 `.just/` 不进库；遇到契约冲突先问，不自行改契约。