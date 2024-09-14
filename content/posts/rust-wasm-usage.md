+++
title="基于 Rust 的 WebAssembly 使用指南"
date=2024-05-27
draft=false
+++

时隔许久，尽管我已经在此期间成功上线了好几个纯 Rust 编写的 Web 服务，但一直没能抽空整理与此相关的基础设施的入门指南。不同于隔壁 JavaScript 娱乐圈每天都能有人整活，Rust 这边不论是要做浏览器还是 WebAssembly 的基础设施都还是非常缺人的，自然也就没有卖课的去关注这方面内容。索性，我决定就如何以 Rust 在浏览器中实现异步操作做个简单的知识梳理。

老实说，[MDN 上的那篇教程](https://developer.mozilla.org/en-US/docs/WebAssembly)其实已经有点过时了，但这是 Rust 这里的基础设施更新太快太激进导致的。我这次写这篇博客就是为了应对这种情况，不要纠结于过时的教程。

## 0. `ASM.js`，解决性能瓶颈的一次尝试

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

## 2. 什么是 `wasm_bindgen`？

作为 Rust 语言开启 WebAssembly 之旅的第一步，`wasm_bindgen` 是一个很好的起点。它的作用是将 Rust 代码与 JavaScript 代码进行绑定，使得 Rust 代码可以在 JavaScript 中被调用。

除了 `wasm_bindgen` 本体可用作依赖库外，其开发团队还准备了一个 CLI 工具 `wasm-bindgen-cli`，用于将 Rust 编译出来的成品进一步处理，将其中打好的标记解析出来并生成对应的 JavaScript 代码，这样就可以直接丢浏览器里跑了。

首先我们可以通过 `cargo` 安装其 CLI 工具：

```bash
cargo install wasm-bindgen-cli@0.2.93 --force # 注意这里的版本不一定是最新的
```

然后新建一个项目，在其中加入 `wasm_bindgen` 依赖：

```toml
[dependencies]
wasm-bindgen = "0.2.93" # 注意这里的版本不一定是最新的
```

> 这里的版本号是截至我撰写该文章时的最新版本。你可以通过在终端运行 `cargo search wasm-bindgen --registry crates-io`，或是直接访问 <https://docs.rs/wasm-bindgen/latest/wasm_bindgen> 来确认最新版本。
>
> 如果在运行 `wasm-bindgen` 时发现版本报错，请通过执行 `wasm-bindgen --version` 来查看当前安装的版本，必须和你当前项目设置的 `wasm-bindgen` 版本完全对应。
>
> 我个人建议 `wasm-bindgen` 始终使用固定版本号。如果使用形如 `^0.2` 这样的浮动版本号，可能会导致不同版本之间的不兼容。也正因如此，当你更新了 `wasm-bindgen` 依赖库的版本时，也需要检查诸如本地环境或者用于生产构建的 Docker 镜像等所使用的 CLI 版本是否与之匹配。

尽管任何准备基于 WebAssembly 编译成 Web 页面的 Rust 项目都一定需要 `wasm_bindgen` 作为依赖，但实际我们不是很常用到它，因为在它之上有 `web-sys` 与 `js-sys` 两个更高级的封装库，可以让我们更方便地与浏览器交互。

> 如果你需要通过 `wasm-bindgen` 手动与 JavaScript 接口作双向绑定，可以[查阅官方文档](https://rustwasm.github.io/docs/wasm-bindgen/examples/hello-world.html)。

顺带一提，`wasm-bindgen` 并非仅局限于在浏览器环境中运行，它也可以用于 Node.js、Deno 等其它支持 WebAssembly 的 JavaScript 运行时。对于诸如 Node.js 这样的环境，通常用于服务端和 Serverless 等场景，[例如 Cloudflare 的 Workers 服务](https://github.com/cloudflare/workers-rs)。

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

很明显，这么一套写法还是比较劝退的。别说手动创建侦听器了，就连手动操作 DOM 这件事本身都有种上世纪 JQuery 的观感。所以，我们可以使用一些更高级的库来帮助我们更方便地操作 DOM。

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

## 5. 过去的 `wasm-pack` 与现在的 `trunk`

`wasm-pack` 是一个用于编译打包 WebAssembly 的工具。它用于简化 `wasm-bindgen-cli` 的使用，自动帮我们完成编译 Rust 代码、和打包生成配套的 JavaScript 代码的工作。

要安装 `wasm-pack`，可以直接通过 `cargo` 安装：

```bash
cargo install wasm-pack
```

理论上，`wasm-pack` 的所有工作其实都可以由我们手动完成，无非是如何花式写 `wasm-bindgen-cli` 的命令行参数。但是，`wasm-pack` 的存在还是很有必要的，因为它提供了一种标准化的打包方式，使得我们可以更方便地在不同项目之间复用打包配置。

除了向浏览器平台编译以外，它还提供了针对其它 JavaScript 执行环境的打包方式，如 NodeJS、Deno。如果向这些目标编译，它还会根据不同的打包方式额外补充一些 JavaScript 样板代码和配置文件。

不过，现在 `wasm-pack` 似乎已经不再有人积极维护了，取而代之的是新兴的 `trunk`。`trunk` 同样也是一个基于 `wasm-bindgen` 的打包工具，但它更着重于对浏览器端做各种设施。

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

`trunk` 会根据这些标签自动识别并处理这些资源文件。在项目的根目录下准备一个 `index.html` 文件，写上类似上述的配置，然后在项目根目录下运行 `trunk serve`。它会在编译完成后开放一个端口，用浏览器打开即可看到实时的编译结果。

> `trunk` 的配置文件是 `Trunk.toml`，一般可以不用写。如果需要定制，[这里有一份官方的示例配置可以参考](https://github.com/trunk-rs/trunk/blob/main/Trunk.toml)。

## 6. 手动编译打包手段 `wasm-bindgen-cli`

## 7. 以对标 `react` 的渲染库 `yew` 构建界面

## 8. 以对标 `imgui` 的库 `egui` 构建界面

## 9. WASM 的标准接口 WASI

## 10. `wasmtime`、`wasmedge`、`wasmer` 三家分晋

三家从其路线上可以分别看作 “学院派”、“实干派”、“实验派”。

`wasmtime` 更倾向于严格遵循标准，毕竟 `WASI` 标准也是主要由这个团队起草的，但也因此这位的产出是最慢的，一天到晚都在开会。不过他们手里同时也有至今最有发展潜力的纯 Rust 写的编译器后端之一 `cranelift`，因此另外两家想踢了他单干是想都别想的。

`wasmedge` 更倾向于快速投入商业使用，到处寻求合作，甚至已经和 Docker 官方达成战略合作，Docker 可以直接部署基于 `wasmedge` 的容器。不过它是 C++ 写的，并且有很多私货，在遵守 `WASI` 基本规范的同时自行加了很多东西。

`wasmer` 更倾向于将其做得更有利于工程化，保证上游链路可以按原样直接用，为此甚至不惜代价重写了一直蔓延到 `rustc` 编译器本身的代码。但也因此魔改的过于剧烈，直接导致其维护的大量上游分支产能跟不上社区，有点割裂。但是 `wasmer` 率先做了 WASI 中心库的设施，所以一时间大家对此也很看好。
