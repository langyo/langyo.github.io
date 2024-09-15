+++
title="基于 Rust 的 WebAssembly 漫游指南"
date=2024-05-27
draft=false
+++

时隔许久，尽管我已经在此期间成功上线了好几个纯 Rust 编写的 Web 服务，但一直没能抽空整理与此相关的基础设施的入门指南。不同于隔壁 JavaScript 娱乐圈每天都能有人整活，Rust 这边不论是要做浏览器还是 WebAssembly 的基础设施都还是非常缺人的，自然也就没有卖课的去关注这方面内容。索性，我决定就如何以 Rust 在浏览器中实现异步操作做个简单的知识梳理。

老实说，[MDN 上的那篇教程](https://developer.mozilla.org/en-US/docs/WebAssembly)其实已经有点过时了，但这是 Rust 这里的基础设施更新太快太激进导致的。我这次写这篇博客就是为了应对这种情况，不要纠结于过时的教程。

## 序言： `ASM.js`，解决性能瓶颈的一次尝试

众所周知，JavaScript 作为一门解释型语言，碰到诸如游戏、神经网络推导等对性能需求很高的场景时会变得萎靡不振，哪怕是拿 C# 或者 Java 这类依托虚拟机的语言写的同样应用都比这玩意跑得快。

到了 2024 年，我们自然知道有 `WebAssembly` 的存在，但这其实不是一蹴而就的。

2012 年，Mozilla 的 [Alon Zakai](https://github.com/kripken) 在研究 LLVM 时，发觉 LLVM 生成的 LLVM IR 是可以编译为 JavaScript 的。LLVM 产生的代码是经过严格类型检查和优化的，因此理论上基于此得到的 JavaScript 可以直接 AOT 编译为本地平台的可执行程序，这样就可以在浏览器中以更高的效率运行 JavaScript 了。

这么说可能不太直观，我们来看一个例子：

```cpp
int add(int a, int b) {
    return a + b + 42;
}
```

把它编译为这种特殊的 JavaScript 代码之后是这样的：

```javascript
function add(a, b) {
    a = a | 0;
    b = b | 0;
    return (a + b + 42) | 0;
}
```

其中这个 `| 0` 是为了告诉 JavaScript 引擎这是一个整数，不要做类型转换。这种标识可以明确地告诉 JavaScript 的 AOT 编译器，这个变量是一个整数，可以放心优化。

这种特殊的 JavaScript 代码就是 `ASM.js`，它是一种 JavaScript 的严格子集，可以被浏览器的 AOT 编译器优化。这种代码可以用 C/C++ 编写，然后通过 Emscripten  等工具编译为 `ASM.js`。

可能有的同学要问了，如果浏览器不支持 `ASM.js` 怎么办？因为 `ASM.js` 是 JavaScript 的严格子集，所以它可以在任何支持 JavaScript 的浏览器上运行，只不过在支持 `ASM.js` 的浏览器上会有更好的性能。换句话讲，这种特殊版本的 JavaScript 更像是一种妥协过渡方案，而不是一种全新的技术。

可惜的是，`ASM.js` 并没有得到广泛的支持，至今仍然只有 Firefox 对其有完整的支持。尽管 `ASM.js` 没能大规模推广，但大家对浏览器高性能计算的需求与各大浏览器厂商的利益冲突之间的矛盾，还是推动了 `WebAssembly` 的诞生。

> 如果你仍然对 `ASM.js` 有兴趣，可以阅读阮一峰的这篇博客：<https://ruanyifeng.com/blog/2017/09/asmjs_emscripten.html>

## 1. `WebAssembly` 的诞生

> 这里有一篇来自 MDN 的总体介绍： <https://developer.mozilla.org/zh-CN/docs/WebAssembly>

`WebAssembly` 就像是 `ASM.js` 的继任者，它是各大浏览器厂商在 W3C 中拌嘴皮子很久才捣鼓出来的新标准。尽管它的名字里带个 Web，但它生来就带有更高的起点。它不再基于 JavaScript，而是作为类似 JVM 的字节码虚拟机存在。

与 JVM、.NET CLR 等一众虚拟机不同的是，WebAssembly 的虚拟机没有（至少目前没加入）自己的 GC（垃圾内存回收器），垃圾内存的回收任务应当由其来源语言自行处理。例如，C++、Rust、Swift 等语言都可以做到全自动回收内存。

目前，WebAssembly 的主流编译方式是基于 LLVM 提供支持。这意味着，只要你的编程语言有 LLVM 的后端，那么你就可以编译为 WebAssembly。这也是为什么 Rust 作为一门以 LLVM 作为编译器后端的语言，能够如此快速地在 WebAssembly 领域崭露头角。

很显然，这种一出生就踩在巨人的肩膀上的优势，使得 WebAssembly 与 Rust 之间有许多共同话题。Rust 作为一门系统编程语言，与 WebAssembly 一样，都是为了解决性能与安全问题而生，可以说是天作之合。

在正式开始前，我们需要先准备一下 Rust 的 WebAssembly 开发环境。如果你还没有安装 Rust，可以参考 [Rust 官方文档](https://www.rust-lang.org/learn/get-started)，这里不再赘述。

我们可以通过 `rustup` 安装 `wasm32-unknown-unknown` 目标平台：

```bash
rustup target add wasm32-unknown-unknown
```

## 2. 什么是 `wasm_bindgen`？

作为 Rust 语言开启 WebAssembly 之旅的第一步，`wasm_bindgen` 是一个很好的起点。它的作用是将 Rust 代码与 JavaScript 代码进行绑定，使得 Rust 代码可以在 JavaScript 中被调用。

新建一个项目，在其中加入 `wasm_bindgen` 依赖：

```toml
[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2.93" # 注意这里的版本不一定是最新的
```

> 这里的版本号是截至我撰写该文章时的最新版本。你可以通过在终端运行 `cargo search wasm-bindgen --registry crates-io`，或是直接访问 <https://docs.rs/wasm-bindgen/latest/wasm_bindgen> 来确认最新版本。

尽管任何准备基于 WebAssembly 编译成 Web 页面的 Rust 项目都一定需要 `wasm_bindgen` 作为依赖，但实际我们不是很常用到它，因为在它之上有 `web-sys` 与 `js-sys` 两个更高级的封装库，可以让我们更方便地与浏览器交互。

> 如果你需要通过 `wasm-bindgen` 手动与 JavaScript 接口作双向绑定，可以[查阅官方文档](https://rustwasm.github.io/docs/wasm-bindgen/examples/hello-world.html)。

顺带一提，`wasm-bindgen` 并非仅局限于在浏览器环境中运行，它也可以用于 Node.js、Deno 等其它支持 WebAssembly 的 JavaScript 运行时。对于诸如 Node.js 这样的环境，通常用于服务端和 Serverless 等场景，[例如 Cloudflare 的 Workers 服务](https://github.com/cloudflare/workers-rs)。

这之后，重新编辑一下入口文件 `lib.rs`，加入适配 `wasm_bindgen` 的启动代码：

```rust
use wasm_bindgen::prelude::*;

#[derive(Clone)]
#[wasm_bindgen]
pub struct WebHandle {}

#[wasm_bindgen]
impl WebHandle {
    #[allow(clippy::new_without_default)]
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        // 初始化代码

        Self {}
    }

    #[wasm_bindgen]
    pub async fn start(&self) -> Result<(), wasm_bindgen::JsValue> {
        // 启动代码，仅当外部浏览器环境调用时执行

        Ok(())
    }
}
```

接下来，我们将介绍一些基于 `wasm-bindgen` 的抽象层次更高的库，它们可以让我们更方便地与浏览器交互。

## 3. 与浏览器直接交互的包装接口 `web_sys` 与 `js_sys`

`web_sys` 与 `js_sys` 是两个用于与浏览器直接交互的 Rust 包装库。`web_sys` 是对 Web API 的封装，而 `js_sys` 是对 JavaScript 内置对象的封装。

我们随便举个例子，比如我们想要在浏览器中弹出一个对话框，我们可以这样写：

```rust
use wasm_bindgen::UnwrapThrowExt as _;

web_sys::window().unwrap_throw().alert_with_message("Ciallo～(∠・ω< )⌒☆").unwrap_throw();
```

要想操纵 DOM 元素也是相当轻松的，比如我们想要在页面中插入一个 `span` 元素，我们可以这样写：

```rust
use wasm_bindgen::UnwrapThrowExt as _;

let document = web_sys::window().unwrap_throw().document().unwrap_throw();
let body = document.body().unwrap_throw();

let el = document.create_element("span").unwrap_throw();
el.set_inner_html("Ciallo～(∠・ω< )⌒☆");
body.append_child(&el).unwrap_throw();
```

比较麻烦的是回调函数，因为 Rust 与 JavaScript 的回调函数是不同的，所以我们需要用 `Closure` 来包装一下：

```rust
use wasm_bindgen::prelude::*;

let document = web_sys::window().unwrap_throw().document().unwrap_throw();
let body = document.body().unwrap_throw();

let el = document.create_element("button").unwrap_throw();
el.set_inner_html("Ciallo～(∠・ω< )⌒☆");
body.append_child(&el).unwrap_throw();

el.add_event_listener_with_callback("click", Closure::wrap(Box::new(
    move |_: web_sys::Event| {
        gloo::dialogs::alert("Ciallo～(∠・ω< )⌒☆");
    }) as Box<dyn FnMut(_)>).as_ref().unchecked_ref()
).unwrap_throw();
```

## 4. 异步支持 `wasm_bindgen_futures`

`wasm_bindgen_futures` 是一个用于在 WebAssembly 中支持异步操作的库。它的作用是将 Rust 的 `Future` 与 JavaScript 的 `Promise` 进行绑定，使得我们可以在 Rust 中使用 `async/await` 语法。

这个库能做出来，很大程度上依赖于浏览器的单线程模型。在浏览器中，所有的异步操作都是基于事件循环的，同一时间保证只做一件事，甚至为此 WebAssembly 在运行时 JavaScript 主线程会被暂时挂起。

下面简单演示一下它的用法：

```rust
use wasm_bindgen::prelude::*;

wasm_bindgen_futures::spawn_local(async {
    let client = reqwest::Client::get("https://httpbin.org/status/418")
        .send()
        .await
        .unwrap_throw();

    if client.status() == reqwest::StatusCode::IM_A_TEAPOT {
        gloo::dialogs::alert("你说得对，但我只是一个茶壶。");
    }
});
```

既然浏览器中 WebAssembly 运行时同样也会阻塞主线程，那为什么浏览器还能正常响应同一页面下其它 JavaScript 代码的事件呢？实际上，在浏览器的事件模型中，WebAssembly 代码也是可以“暂停”运行的，就像 JavaScript 正在运行的长时间计算，也有可能会因为用户操作而临时挂起一样。

> 可能有经验的同学会问，为什么不使用 `tokio` 或者 `async-std` 这类更通用的异步库呢？
>
> 很显然，浏览器这种单线程、基于事件循环的异步模型与 `tokio`、`async-std` 这类多线程、基于线程池的异步模型是不同的。作为通用的异步库，它们很难为了浏览器这么一类奇葩而自断一臂，以此强行适配。
>
> 不过，`yew` 的开发组也有两边都进行异步操作的需求，所以他们写了个名为 [`prokio`](https://github.com/yewstack/prokio) 的库，以提供一个同时兼容浏览器与通用多线程架构的接口，分别在两边使用不同的异步库。

## 5. 手动编译打包手段 `wasm-bindgen-cli`

现在，我们终于进入 WebAssembly 的编译与打包阶段了。

除了 `wasm_bindgen` 本体可用作依赖库外，其开发团队还准备了一个名字很像的 CLI 工具 `wasm-bindgen-cli`，用于将 Rust 编译出来的成品进一步处理，将其中打好的标记解析出来并生成对应的 JavaScript 代码，这样就可以直接丢浏览器里跑了。

首先我们可以通过 `cargo` 安装其 CLI 工具：

```bash
cargo install wasm-bindgen-cli@0.2.93 --force # 注意这里的版本不一定是最新的
```

> 如果在运行 `wasm-bindgen` 时发现版本报错，请通过执行 `wasm-bindgen --version` 来查看当前安装的版本，**必须**和你当前项目设置的 `wasm-bindgen` 版本完全对应。
>
> 我个人建议 `wasm-bindgen` 始终使用固定版本号。如果使用形如 `^0.2` 这样的浮动版本号，可能会导致不同版本之间的不兼容。也正因如此，当你更新了 `wasm-bindgen` 依赖库的版本时，也需要检查诸如本地环境或者用于生产构建的 Docker 镜像等所使用的 CLI 版本是否与之匹配。

然后，我们可以通过 `wasm-bindgen` 命令来编译打包我们的 WebAssembly 代码：

```bash
wasm-bindgen --out-dir ./target/wasm32-html-app --out-name test --target no-modules --no-typescript --no-modules-global wasm_vendor_entry ./target/wasm32-unknown-unknown/release/test.wasm
```

其中，`--out-dir` 用于指定输出目录，`--out-name` 用于指定输出文件名，`--target` 用于指定输出的 JavaScript 代码的模块化方式，`--no-typescript` 用于禁用 TypeScript 类型提示代码（`.d.ts`）的生成，`--no-modules-global` 用于禁用全局模块化。

最后，在引用了生成的 JavaScript 文件的 HTML 文件中，我们可以这样引用：

```html
<script src='/test.js'></script>
<script>
(async () => {
    await wasm_vendor_entry('/test_bg.wasm');
    (await (new wasm_vendor_entry.WebHandle())).start();
})()
</script>
```

这里的全局变量 `wasm_vendor_entry` 直接对应我们在调用 `wasm-bindgen-cli` 时指定的参数项 `--no-modules-global`。另外，`wasm-bindgen-cli` 生成的文件中，WASM 文件的后缀是 `_bg.wasm`，JavaScript 文件的后缀是 `.js`，小心别搞错了。

## 6. 过去的 `wasm-pack` 与现在的 `trunk`

上面这一顿操作还是比较麻烦的，所以在浏览器 WASM 推广的初期，有人想到了可以把这些操作封装成一个工具，这样就可以直接用命令行一键编译打包了。

`wasm-pack` 就是其中最出名的一个，它用于简化 `wasm-bindgen-cli` 的使用，自动帮我们完成编译 Rust 代码、和打包生成配套的 JavaScript 代码的工作。

要安装 `wasm-pack`，可以直接通过 `cargo` 安装：

```bash
cargo install wasm-pack
```

理论上，`wasm-pack` 的所有工作其实都可以由我们手动完成，无非是如何花式写 `wasm-bindgen-cli` 的命令行参数。但是，`wasm-pack` 的存在还是很有必要的，因为它提供了一种标准化的打包方式，使得我们可以更方便地在不同项目之间复用打包配置。

除了向浏览器平台编译以外，它还提供了针对其它 JavaScript 执行环境的打包方式，如 NodeJS、Deno。如果向这些目标编译，它还会根据不同的打包方式额外补充一些 JavaScript 样板代码和配置文件。

不过，现在 `wasm-pack` 似乎已经不再有人积极维护了，取而代之的是新兴的 `trunk`。`trunk` 同样也是一个基于 `wasm-bindgen` 的打包工具，但它更着重于只针对浏览器端做各种打包工作。

`trunk` 的安装也是通过 `cargo` 进行：

```bash
cargo install trunk
```

`trunk` 有点像是 `vite` 的 Rust 版本，通过识别用户给的粗略的 HTML 文件，根据其中列出引用的资源文件做各种打包工作。[它能接受的资源类型很丰富](https://trunkrs.dev/assets)，除了基本的 `CSS` 与 `JavaScript` 之外，还可以直接引用包含额外的 Rust 代码、扩展的 SASS / SCSS 样式表、图标文件等。

```html
<html>
  <head>
    <link data-trunk rel="scss" href="path/to/index.scss"/>
    <link data-trunk rel="copy-file" href="path/to/image"/>
  </head>
</html>
```

`trunk` 会根据这些标签自动识别并处理这些资源文件。在项目的根目录下准备一个 `index.html` 文件，写上类似上述的配置，然后在项目根目录下运行 `trunk serve`。它会在编译完成后开放一个端口，用浏览器打开即可看到实时的编译结果。如果需要发布，可以运行 `trunk build`，它会将编译结果输出到工作目录下的 `dist` 目录。

> `trunk` 的配置文件是 `Trunk.toml`，一般可以不用写。如果需要定制，[这里有一份官方的示例配置可以参考](https://github.com/trunk-rs/trunk/blob/main/Trunk.toml)。

其实，这两个工具 `wasm-pack` 与 `trunk` 都是基于 `wasm-bindgen-cli` 的封装。如果你对这两个工具不满意，或者有更复杂的定制需求，可以直接使用 `wasm-bindgen-cli`。

## 7. 以对标 `react` 的渲染库 `yew` 构建界面

前面我们有介绍过基于 `web_sys` 与 `js_sys` 手动控制浏览器渲染界面的方法。很明显，这么一套写法还是比较劝退的。别说手动创建侦听器了，就连手动操作 DOM 这件事本身都有种上世纪 JQuery 库的观感。所幸，我们可以使用一些更高级的库来帮助我们更方便地操作 DOM。

目前 `yew` 算是最适合担任这种任务的框架。`yew` 可以视作 Rust 语言版本的 `react`，它同样引入了虚拟 DOM 和函数化组件，并且还做了个用于解析类似 HTML 结构的宏，使得我们可以直接在 Rust 代码中写类似 `react` 中 `jsx` 那样的代码：

```rust
use yew::prelude::*;

#[derive(Properties, Debug, PartialEq)]
pub struct Props {
    #[prop_or("Ciallo～(∠・ω< )⌒☆".to_string())]
    pub onclick_message: String,
    pub children: Html,
}

#[function_component]
pub fn NewButton(props: &Props) -> Html {
    html! {
        <div>
            <button onclick={
                let onclick_message = props.onclick_message.clone();

                move |_| {
                    gloo::dialogs::alert(&onclick_message);
                }
            }>
                { props.children.clone() }
            </button>
        </div>
    }
}
```

尽管 `yew` 不是必须要求掌握的，但我个人还是建议大家在试图让 Rust 接管浏览器渲染逻辑时使用 `yew`。熟悉 `react` 或者 `vue` 的同学可以很快上手，不过如果你是第一次接触这类框架，最好还是先熟悉在 JavaScript 下 `vue` 或者 `react` 的基本用法。

> 可能有的同学也不是很熟悉 `react` 与 `vue` 的用法，只是知道它是一个出名的前端框架。尽管这没有脱离 JavaScript 既有的语法，但 `react` 与 `vue` 特有的业务逻辑写法还是不太容易入门的。个人建议，理解此类框架设计逻辑的最好办法就是尝试“抄”官方文档提供的例程，照着官方流程来个一两遍就能理解了。
>
> 我个人也在着手尝试开发一个基于 yew 的界面框架，除了能够自动初始化页面路由、全局状态、提供一大批通用界面组件等以外，而且还在尝试实现同构开发，即直接在客户端业务代码中书写服务端业务代码（例如用户凭据验证、数据库读写等），编译后自动拆分与对接。目前还处于开发阶段，有兴趣的同学可以看一下 [Hikari 项目的仓库](https://github.com/celestia-island/hikari)。

## 8. 以对标 `imgui` 的库 `egui` 构建界面

浏览器渲染界面的方式不止一种，除了通过操作 DOM 配合 CSS 来构建界面外，还有一种办法是通过 `<canvas>` 元素来绘制界面。这种方式的优势在于，我们可以直接操作绘制区域的每一个像素，不仅能实现 CSS 无法实现的各种特殊渲染需求，而且还能间接实现渲染内容的反篡改保护。

`egui` 就是这样一种直接绘制像素的界面库。它的设计灵感来自于 `imgui`，是一个基于立即模式的 GUI 库。它不依赖于任何外部库，只需要一个 `<canvas>` 元素就可以绘制界面。除了浏览器以外，它也可以通过 `wgpu` 等库实现本地操作系统程序的界面绘制。

正式使用 `egui` 之前，我们需要在 `Cargo.toml` 中加入 `egui` 与 `eframe` 依赖：

```toml
[dependencies]
egui = "^0.28"      # 注意这里的版本不一定是最新的
eframe = "^0.28"    # 必须与 egui 版本号对应
```

`egui` 的使用方式也很简单，只需要在 `wasm-bindgen` 初始化阶段创建一个 `egui` 的上下文，然后在每一帧绘制时调用 `egui` 的绘制函数即可：

```rust
pub struct Entry {
    label: String
}

impl Default for Entry {
    fn default() -> Self {
        Self {
            label: "Ciallo～(∠・ω< )⌒☆".to_string()
        }
    }
}

impl eframe::App for Entry {
    fn update(&mut self, ctx: &eframe::Context, _frame: &mut eframe::Frame) {
        egui::CentralPanel::default().show(ctx, |ui| {
            ui.label(self.label.clone());
        });
    }
}

use eframe::wasm_bindgen::{self, prelude::*};

#[derive(Clone)]
#[wasm_bindgen]
pub struct WebHandle {
    runner: eframe::WebRunner,
}

#[wasm_bindgen]
impl WebHandle {
    #[allow(clippy::new_without_default)]
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            runner: eframe::WebRunner::new(),
        }
    }

    #[wasm_bindgen]
    pub async fn start(&self) -> Result<(), wasm_bindgen::JsValue> {
        self.runner
            .start(
                "entry_canvas",
                eframe::WebOptions::default(),
                Box::new(|cc| Ok(Box::new(Entry::default()))),
            )
            .await
    }

    #[wasm_bindgen]
    pub fn destroy(&self) {
        self.runner.destroy();
    }

    #[wasm_bindgen]
    pub fn has_panicked(&self) -> bool {
        self.runner.has_panicked()
    }

    #[wasm_bindgen]
    pub fn panic_message(&self) -> Option<String> {
        self.runner.panic_summary().map(|s| s.message())
    }

    #[wasm_bindgen]
    pub fn panic_callstack(&self) -> Option<String> {
        self.runner.panic_summary().map(|s| s.callstack())
    }
}
```

在 HTML 文件中，我们需要加入一个 `<canvas>` 元素，用于绘制 `egui` 界面：

```html
<canvas id="entry_canvas" width="800" height="600"></canvas>
<script src='/test.js'></script>
<script>
(async () => {
    await wasm_vendor_entry('/test_bg.wasm');
    (await (new wasm_vendor_entry.WebHandle())).start();
})();
</script>
```

`egui` 的使用方式与 `yew` 有很大不同，由于立即模式的特性，我们需要在每一帧绘制时重新绘制整个界面。这样的设计使得 `egui` 更适合于实时渲染的应用，如游戏 HUD 界面、仪表盘等。官方没有就这个库的每个组件提供具体的文档，而是直接写了一个包含各种内置界面元素的[示例页面](https://www.egui.rs)，在交互式的界面中可以直接查看每个组件的运行效果。

## 9. WASM 的标准接口 WASI

最后，我们来介绍一下 `WASI`。`WASI` 是 `WebAssembly System Interface` 的缩写，是一个标准化的 WebAssembly 与宿主环境交互的接口。它的设计目标是为 WebAssembly 提供一个标准的系统调用接口，使得 WebAssembly 可以在不同的宿主环境中运行，而不需要对每个宿主环境进行特定的适配。

WASI 的设计灵感大多来自于 POSIX 标准，它提供了一系列的系统调用，如文件读写、网络操作、时间获取、随机数等。我们不必为不同的虚拟机环境而头疼，只需要利用 WASI 的标准接口，就可以在任何支持 WASI 的虚拟机环境中运行。

我们可以通过 `rustup` 安装 `wasm32-wasip1` 目标平台：

```bash
rustup target add wasm32-wasip1
```

> 可能有的同学之前使用过这套工具链，发现这个编译目标的名字不是 `wasm32-wasi` 而是 `wasm32-wasip1`。这是近期 Rust 官方就此编译目标做的重大更改，[详情可以参考这篇博客](https://blog.rust-lang.net.cn/2024/04/09/updates-to-rusts-wasi-targets.html)。

这之后，编写 WASI 程序的流程其实和编写普通的 Rust 程序没什么区别。只是在编译时，我们需要指定编译目标为 `wasm32-wasip1`：

```rust
use std::fs::File;

fn main() {
    let file = File::create("test.txt").unwrap();
    file.write_all(b"Ciallo～(∠・ω< )⌒☆").unwrap();
}
```

```bash
cargo build --target wasm32-wasip1
```

以我个人的眼光来看，WASI 的出现是 WebAssembly 发展的一个重要里程碑。它使得 WebAssembly 不再局限于浏览器环境，可以将 WebAssembly 用于 Serverless、通用嵌入式设备等领域，以此作为一个轻量级的高性能虚拟机与 JVM、CLR 等虚拟机平台竞争。

> 我个人也在着手尝试开发一个基于 WASI 的服务端框架，为所有兼容我这个框架的 WASI 程序提供全自动的数据库、文件缓存、日志、负载均衡等服务。目前还处于开发阶段，有兴趣的同学可以看一下 [Tairitsu 项目的仓库](https://github.com/celestia-island/tairitsu)。

不过，WASI 目前的路还是比较坎坷，主要原因是社区间意见不统一。目前最具代表性的三个虚拟机实现 `wasmtime`、`wasmedge`、`wasmer` 都对 WASI 有自己的实现，但它们之间的实现并不完全兼容。

## 10. `wasmtime`、`wasmedge`、`wasmer` 三家分晋

个人认为，三家从其路线上可以分别看作 “学院派”、“市场派”、“工程派”。

学院派 `wasmtime` 更倾向于脚踏实地一步步做标准化，毕竟 `WASI` 标准也是主要由这个团队起草的。但不得不吐槽的是，这位的产出也因此是最慢的，[毕竟一天到晚都在开会](https://bytecodealliance.zulipchat.com/#narrow/stream/217126-wasmtime)。不过他们手里同时也有至今最有发展潜力的纯 Rust 写的编译器后端之一 `cranelift`——本来是专门写给 `wasmtime` 用的，后面发现也可以用于 Rust 本身的开发，于是就拿去作为 `rustc` 的备用编译器后端了~~，另外两家想踢了他单干是想都别想的~~。

市场派 `wasmedge` 更倾向于快速投入商业使用，到处寻求合作。目前它已经和 Docker 官方达成战略合作，[Docker 可以直接部署基于 `wasmedge` 的容器](https://wasmedge.org/docs/zh/start/build-and-run/docker_wasm)。不过它是 C++ 写的，并且有很多私货，在遵守 `WASI` 基本规范的同时自行加了很多东西。

工程派 `wasmer` 更倾向于将其做得更有利于工程化，保证上游链路可以按原样直接用，为此甚至不惜代价重写了一直蔓延到 `tokio`、`mio`、`rustc` 等的代码。但也因此，它对基础设施魔改的过于剧烈，直接导致其维护的大量上游分支产能跟不上社区，有点割裂。除此之外，`wasmer` 还率先做了 [WASI 中心库](https://wasmer.io/explore)的设施，就连像 `sqlite`、`lua` 等这些用 C 写的知名依赖库也给做进这个中心库了，所以一时间大家对此也很看好。

目前，我倾向于使用 `wasmtime` 作为 WASI 的运行时，因为它是最接近标准的实现，有官方背书的标准起码不必担心跑路问题。尤其是最近 WASI 0.2 标准的发布，让整个 Rust 社区就 WASI 的话题中心都集中到 `wasmtime` 与其背后的 Bytecode Alliance 开源组织身上了。不过，如果你想尽快提前体验 WASI 承诺的诸如网络请求、文件操作等功能，`wasmedge` 与 `wasmer` 也是不错的选择，只是得想清楚未来可能得承担技术迁移的代价。

## 结语：一点碎碎念

目前，WebAssembly 这玩意算是除了 Rust 以外最符合我对近未来新技术主流架构的设想了。我经常在想能将 WASI 作为嵌入式设备与 Serverless 云服务集群的基础，以此弥补 JVM 过于臃肿和带有版权争议的问题，进而可以设计制造我力所能及的各种智能设备。如果不能先打好这种基础，不论是星辰大海还是赛博朋克，都还只能是空中楼阁。

这篇博客自 5 月份开坑以来，断断续续写了很久，终于在 9 月中秋节前夕完成了。这篇博客的初衷更多是为了整理一些我目前了解到的知识，顺便再给大家看迅速了解一下目前这个还算小众的生态现在过得如何。总之，还是希望这篇文章能对你有点帮助。
