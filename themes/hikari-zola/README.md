# hikari-zola

Zola 自研主题：**hikari 设计 token + 明日方舟式扁平 HUD × 蔚蓝档案千禧年（白 + 浅蓝）**。
主角是天童爱丽丝（浅蓝主色）；hero 右侧是**全息投影舱**，舱内缓慢旋转自研 WebGL2 点云电磁炮 **RG·SUPERNOVA**（无 three.js，可降级）。
零外部运行时依赖：系统字体、原生 ES module、无 CDN。

~~~
themes/hikari-zola/
  theme.toml                主题元数据（min_version = "0.21.0"）
  templates/                Tera：base/index/section/page/about/404/taxonomy_* + partials/
  sass/style.scss           唯一入口（@use 各层，顺序即契约）
  sass/vendor/hikari/       hikari 官方 token 逐字副本 + PROVENANCE.md（禁止手改）
  sass/hk/                  站点设计系统（palette → base → type → layout → chrome →
                            controls → surfaces → prose → hero → dossier → backdrop →
                            motion → utilities）
  static/js/                main.js + prefs/nav/reveal/toc/copy；backdrop/ 为点云
  static/img/               主题装饰（由内容组脚本产出，只读引用）
~~~

## 设计来源

* **token**：`@celestia-island/hikari` v0.55.255（SySL-1.0）的 `--color-*` 通道色、
  `--space-*/--text-*/--radius-*/--duration-*/--ease-*/--font-*` scale 层、`--hi-*` 桥接。
  逐字 vendor 在 `sass/vendor/hikari/`，同步方式见下方「vendor 同步」。
* **视觉**：明日方舟式扁平 HUD（发丝线、切角、四角括号、mono 微标签、编号、读数）+ 千禧年
  （白 + 浅蓝 + 干净科技感）。层级靠线/切角/留白/字号反差，不靠阴影；阴影只用于 drawer 等浮层。
  hero 右侧是**全息投影舱**：发丝外框 + 四角括号 + 内层虚线投影场 + 地面椭圆辉光 + 极淡扫描线，
  舱内由 `data-hk-anchor` 锚定画布绘制点云电磁炮；小屏时退化为正文 CTA 下方的全宽横幅。
  **交互**：舱体可拖拽旋转（`.hk-hero__figure` 是 pointer 面，按住时加 `.is-dragging`：抓取光标 +
  括号/边框提亮 + 基座辉光略亮）；松手带惯性，idle 数秒后恢复自动缓慢旋转；
  `prefers-reduced-motion: reduce` 下无自动旋转与惯性，只能手动拖拽（首帧静态）。
* **符号**：`//` mono 标签、`FILE 0xNN` 编号、`◆` 菱形、四角括号 `.hk-frame`、切角
  `.hk-cut`/`hk-panel`、端点加粗分隔线、hazard 斜纹、网格/点阵底纹、十字 `.hk-tick`、
  属性条 `.hk-attr`、`SYS.STATUS` 读数、hero 扫描线。

## 依赖

* Zola **>= 0.21**（`theme.toml: min_version`；使用 0.21 的 syntect CSS 高亮输出）
* 无 Node/npm，无 webfont，无 CDN。

## 站点 config.toml（最小可用）

~~~toml
theme = "hikari-zola"
compile_sass = true
generate_feeds = true
feed_filenames = ["atom.xml"]

[taxonomies]
name = "tags"

[markdown]
highlight_code = true
highlight_theme = "css"     # 必须：主题只实现 .z-* syntect 类

[extra]
author = { name = "...", email = "..." }
menu = [ { name = "记录", url = "/posts/" }, { name = "关于", url = "/about/" } ]
social = [ { name = "GitHub", url = "https://github.com/<user>" } ]
footer_copyright = "CC BY-NC 4.0"
footer_recordation_text = "..."          # 备案（可选）

[extra.hero]                              # 首页 hero
kicker = "MILLENNIUM · OPERATOR FILE"
subtitle = "..."
datalines = [ { k = "CLASS", v = "FULL-STACK" } ]
cta = [ { label = "进入记录", url = "/posts/" } ]

[extra.profile]                           # /about 操作员档案 + 首页 about teaser
codename = "LANGYO"
name = "..."
location = "上海 · 中国"
avatar = "img/alice-badge.webp"
roles = ["..."]
[[extra.profile.attributes]]
k = "FRONTEND"
v = 88

[extra.backdrop]                          # 点云背景（backdrop 组读取）
enable = true
variant = "hero"                          # hero | ambient | off
density = "auto"
parallax = true

[extra.analytics]                         # 仅 enable=true 时才注入
enable = false
id = ""
~~~

菜单 `url` 用站点根绝对路径（`/posts/`）。没有配置的键全部有 `default` 兜底。

## 内容 frontmatter

~~~toml
+++
title = "..."
date = 2024-05-01
description = "一句话摘要（<=80 汉字）"
template = "about.html"        # 仅 about.md 需要
[taxonomies]
tags = ["rust", "windows"]
[extra]
summary = "列表卡片摘要（可选，缺省用 description）"
toc = true                     # false 可关闭文章右侧目录
+++
~~~

列表卡片摘要取 `extra.summary` → `description` → `summary`；`toc` 缺省为 true。

## 分层与 token

* `vendor/hikari/_scale.scss`：间距/字号/圆角/时长/ease/字体/z-index。
* `vendor/hikari/_channels.scss`：`--color-*` 通道色（RGB 三元组，用 `rgb(var(--color-primary))` 消费）与 `--hi-*` 别名。
* `hk/_palette.scss`：站点覆盖 `--color-*`（浅蓝/白）+ 由通道色派生的站点语义 token：
  `--hk-bg/surface/sunken/elev/fg/fg-2/fg-3/muted/line/line-strong/accent/glow/accent-soft/accent-line/warn/link/ink/on-ink/shadow-1/shadow-2`、
  `--hk-page-max:1180px`、`--hk-article-max:780px`、`--hk-gutter`、`--hk-topbar-h:64px`、
  `--hk-measure:68ch`、`--hk-cut:14px`、`--hk-cut-sm:8px`、`--hk-hair:1px`、`--hk-cyanish`。
* 亮/暗两套：亮色是 `:root` 默认，暗色是 `html[data-theme="dark"]`，并在
  `@media (prefers-color-scheme: dark)` 下对 `html:not([data-theme="light"])` 再声明一次
  （无 JS 也能跟随系统）。暗色只重声明通道色 + syntax family，语义 token 自动跟随。
* 代码高亮：`--code-keyword/string/number/comment/function/type/variable/builtin`
  （亮 = GitHub-Light 倾向，暗 = One Dark 倾向），`.z-*` 类在 `hk/_prose.scss` 映射。

## 类清单索引（templates 与 sass 的共同语言）

* 布局：`hk-shell` `hk-container` `hk-main` `hk-main--article` `hk-main--dossier` `hk-main--404`
  `hk-grid-bg` `hk-noise` `hk-backdrop` `hk-backdrop__canvas` `hk-page`
* 顶栏：`hk-topbar` `hk-topbar__inner` `hk-brand` `hk-brand__mark` `hk-brand__name` `hk-brand__tag`
  `hk-nav` `hk-nav__link` `hk-nav__idx` `hk-topbar__actions` `hk-topbar__burger` `hk-iconbtn`
  `hk-progress` `hk-progress__bar` `hk-drawer` `hk-drawer__list` `hk-drawer__link` `hk-drawer__meta`
* 原子：`hk-label` `hk-label--warn` `hk-btn` `hk-btn--primary` `hk-btn--ghost` `hk-btn--bare`
  `hk-btn__arrow` `hk-chip` `hk-chip--solid` `hk-tag` `hk-dataline` `hk-dataline__k` `hk-dataline__v`
  `hk-rule` `hk-rule--vert` `hk-rule--diamond` `hk-diamond` `hk-cut` `hk-frame` `hk-stamp`
  `hk-tick` `hk-hazard` `hk-meter` `hk-skip`
* hero：`hk-hero` `hk-hero__grid` `hk-hero__body` `hk-hero__title` `hk-hero__caret` `hk-hero__sub`
  `hk-hero__meta` `hk-hero__cta` `hk-hero__figure` `hk-hero__frame`
  `hk-hero__silhouette` `hk-hero__ticks` `hk-hero__side` `hk-hero__scroll`
* 首页区块：`hk-section` `hk-section--latest` `hk-section--about` `hk-section--status`
  `hk-section__head` `hk-section__label` `hk-section__title` `hk-section__more`
  `hk-cardgrid` `hk-postcard` `hk-postcard__link` `hk-postcard__idx` `hk-postcard__date`
  `hk-postcard__title` `hk-postcard__sum` `hk-postcard__tags`
  `hk-status` `hk-status__item` `hk-status__k` `hk-status__v`
* 代码活动面板（科幻 HUD 三模块）：`hk-gh` `hk-gh__module` `hk-gh__module--telemetry`
  `hk-gh__module--signal` `hk-gh__module--archive` `hk-gh__meta`
  `hk-gh__stats` `hk-gh__stat` `hk-gh__stat-k` `hk-gh__stat-v` `hk-gh__stat-sub`
  `hk-gh__bars` `hk-gh__bar` `hk-gh__trend` `hk-gh__trend-bar`
  `hk-gh__repos` `hk-gh__repo` `hk-gh__link` `hk-gh__repo-name` `hk-gh__repo-stars`
  `hk-gh__streak` `hk-gh__ring` `hk-gh__ring-track` `hk-gh__ring-arc`
  `hk-gh__streak-v` `hk-gh__streak-u` `hk-gh__streak-k`
* 列表：`hk-pagehead` `hk-pagehead__title` `hk-pagehead__desc` `hk-pagehead__count`
  `hk-timeline` `hk-year` `hk-year__num` `hk-postlist` `hk-postrow` `hk-postrow__link`
  `hk-postrow__idx` `hk-postrow__title` `hk-postrow__date` `hk-taglist` `hk-tagrow`
  `hk-tagrow__link` `hk-tagrow__name` `hk-tagrow__count`
* 文章：`hk-article` `hk-article__head` `hk-article__title` `hk-article__meta` `hk-article__body`
  `hk-article__foot` `hk-prose` `hk-tags` `hk-pager` `hk-pager__item` `hk-pager__item--prev`
  `hk-pager__item--next` `hk-pager__dir` `hk-pager__title` `hk-toc` `hk-toc__title`
  `hk-toc__list` `hk-toc__link` `hk-code` `hk-code__head` `hk-code__lang` `hk-code__copy` `hk-code__body`
* 档案：`hk-dossier` `hk-dossier__card` `hk-dossier__figure` `hk-dossier__avatar` `hk-dossier__name`
  `hk-dossier__handle` `hk-dossier__roles` `hk-dossier__attrs` `hk-dossier__contact` `hk-dossier__body`
  `hk-attr` `hk-attr__k` `hk-attr__bar` `hk-attr__fill` `hk-attr__v`
  `hk-skillgrid` `hk-skill` `hk-skill__name` `hk-skill__items`
  `hk-career` `hk-career__item` `hk-career__year` `hk-career__text`
* footer：`hk-footer` `hk-footer__status` `hk-footer__stat` `hk-footer__main` `hk-footer__nav`
  `hk-footer__social` `hk-footer__copy` `hk-footer__beian` `hk-footer__tech`
* 杂项：`hk-reveal` `hk-visually-hidden` `hk-404` `hk-404__code`

状态类：`.is-active`（导航/目录）、`.is-open`（drawer）、`.is-in`（reveal）、`.is-done`（复制按钮）。
允许的 Zola/syntect 类：`.z-code`、`.z-*`、`.language-*`。**新增类必须先改契约。**

## JS 与 data-* 钩子

`static/js/main.js` 是唯一入口（`html.no-js → js`，各模块动态 import + try/catch）。
钩子：`data-hk-theme-toggle` `data-hk-nav-toggle` `data-hk-drawer` `data-hk-progress`
`data-hk-toc` `data-hk-reveal` `data-hk-article` `data-hk-code-copy` `data-hk-backdrop`。
CSS 侧的对接点：

* `.hk-progress__bar` 宽度由 `--hk-progress`（百分比）驱动（nav.js 写自定义属性；写 inline width 同样生效）。
* `.hk-reveal` 默认可见，仅 `html.js` 存在时才隐藏并由 reveal.js 加 `.is-in`（无 JS 不出白屏）。
* copy.js 把 `pre.z-code` 包成 `.hk-code > __head(__lang+__copy) / __body`；无 JS 时用
  `pre::before { content: attr(data-lang) }` 显示语言角标。

## vendor 同步

```console
just sync-hikari-tokens      # scripts/sync-hikari-tokens.py
```

从 `@celestia-island/hikari` 复制 `_scale/_channels/_reset/_selection/_scrollbar/_highlight/_polyfill`
到 `sass/vendor/hikari/`（`_polyfill.scss` 是 upstream `_selection.scss` 的依赖，缺失会构建失败），
逐字正文 + provenance 头。**不要手改 vendor**；站点覆盖只写 `sass/hk/*`。
详见 `sass/vendor/hikari/PROVENANCE.md`。

## 可访问性

* 每页恰好一个 h1；`a.hk-skip[href="#main"]` 跳转链接；`html.no-js` 首行替换为 `js`。
* 全局 `:focus-visible { outline: 2px solid var(--hk-accent); outline-offset: 2px }`。
* 对比度（实测，见审计）：正文 15.4:1 / 次要 6.2:1 / 链接 4.7:1（亮）、16.5/8.3/11.4（暗）；
  HUD 微标签与日期/编号/目录等**信息性**小字统一用 `--hk-fg-3`（亮 rgb(84 106 128)=5.35~5.6:1、暗 6.1:1）；
  `--hk-muted` 只做装饰、不承载文字。琥珀 `--hk-warn` 只做线/底/描边，琥珀**文字**一律用
  `--hk-warn-ink`（亮 rgb(138 90 0)=5.67:1 / 暗 255 194 75=11.75:1）。
* 代码 token 全部落在 `--code-*` 上，明暗两套均 ≥4.5:1（comment 亮 4.6:1 / 暗 5.5:1）。
* `prefers-reduced-motion: reduce` 关闭全部动画/过渡与点云动画；hero 光标停顿。
* icon-only 按钮均有 `aria-label`；drawer 有 `aria-expanded/aria-hidden`，打开时锁背景滚动、Esc/点外部关闭。
* 正文可选中（vendor selection 默认 deny，`body` 重新放行，chrome 子树再 opt-out）。

## 预算（本仓门禁）

| 项 | 上限 | 主题实测 |
|---|---|---|
| `style.css` | 64 KB（gzip 12 KB） | **63,174 B / gzip 12,232 B** |
| `main.js` + 模块（不含 backdrop） | 14 KB | 12,217 B |
| backdrop JS | 34 KB | 由 backdrop 组自测 |

## 许可

* 主题代码：**SySL-1.0**（与生态一致，见仓库 LICENSE）。
* 站点内容：**CC BY-NC 4.0**（footer/README 声明）。
* vendored hikari token：**SySL-1.0**，来源与版本见 `sass/vendor/hikari/PROVENANCE.md`。