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

2012 年，Mozilla 的 [Alon Zakai](https://github.com/kripken) 在研究 LLVM 时，发觉其实 LLVM 生成的 LLVM IR 是可以编译为 JavaScript 的。由于 LLVM 产生的代码是经过严格类型检查和优化的，所以理论上基于此得到的 JavaScript 可以直接 AOT 编译为本地平台的可执行程序，这样就可以在浏览器中以更高的效率运行 JavaScript 了。

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

可惜的是，`ASM.js` 并没有得到广泛的支持，至今仍然只有 Firefox 对其有完整的支持。尽管 `ASM.js` 没能大规模推广，但人民群众对高性能的需求与各大浏览器厂商的利益冲突之间的矛盾，还是推动了 `WebAssembly` 的诞生。

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
cargo install wasm-bindgen-cli@0.2.92 --force
```

然后新建一个项目，在其中加入 `wasm_bindgen` 依赖：

```toml
[dependencies]
wasm-bindgen = "0.2.92"
```

> 这里的版本号是截至我撰写该文章时的最新版本。你可以通过 `cargo search wasm-bindgen --registry crates-io` 来确认最新版本。
>
> 如果在运行 `wasm-bindgen` 时发现版本报错，请通过执行 `wasm-bindgen --version` 来查看当前安装的版本，必须和你当前项目设置的 `wasm-bindgen` 版本完全对应。
>
> 我个人建议不论是依赖库还是 CLI 工具，均使用固定版本号。如果使用形如 `^0.2` 这样的浮动版本号，可能会导致不同版本之间的不兼容。也正因如此，当你更新了 `wasm-bindgen` 依赖库的版本时，也需要检查诸如本地环境或者用于生产构建的 Docker 镜像等所使用的 CLI 版本是否与之匹配。

尽管任何准备基于 WebAssembly 编译成 Web 页面的 Rust 项目都一定需要 `wasm_bindgen` 作为依赖，但实际我们不是很常用到它，因为在它之上有 `web-sys` 与 `js-sys` 两个更高级的封装库，可以让我们更方便地与浏览器交互。

> 如果你需要通过 `wasm-bindgen` 手动与 JavaScript 接口作双向绑定，可以[查阅官方文档](https://rustwasm.github.io/docs/wasm-bindgen/examples/hello-world.html)。

顺带一提，`wasm-bindgen` 并非仅局限于在浏览器环境中运行，它也可以用于 Node.js、Deno 等其它支持 WebAssembly 的 JavaScript 运行时。对于诸如 Node.js 这样的环境，通常用于服务端和 Serverless 等场景，[例如 Cloudflare 的 Workers 服务](https://github.com/cloudflare/workers-rs)。

## 3. 与浏览器直接交互的包装接口 `web_sys` 与 `js_sys`

`web_sys` 与 `js_sys` 是两个用于与浏览器直接交互的 Rust 包装库。`web_sys` 是对 Web API 的封装，而 `js_sys` 是对 JavaScript 内置对象的封装。

我们随便举个例子，比如我们想要在浏览器中弹出一个对话框，我们可以这样写：

```rust
// TODO: 代码示例
```

## 4. 异步支持 `wasm_bindgen_futures`

## 5. 过去的 `wasm-pack` 与现在的 `trunk`

## 6. 手动编译打包手段 `wasm-bindgen-cli`

## 7. 以类似 `React` 的渲染库 `yew` 构建界面

## 8. 以类似 `imgui` 的库 `egui` 构建界面

## 9. 来自“未来”的 `WASI`

## 10. `wasmtime`、`wasmedge`、`wasmer` 三家分晋

三家从其路线上可以分别看作 “学院派”、“实干派”、“实验派”。

`wasmtime` 更倾向于严格遵循标准，毕竟 `WASI` 标准也是主要由这个团队起草的，但也因此这位的产出是最慢的，一天到晚都在开会。不过他们手里同时也有至今最有发展潜力的纯 Rust 写的编译器后端之一 `cranelift`，另外两家想踢了他是想都别想的事情。

`wasmedge` 更倾向于快速投入商业使用，到处寻求合作，甚至已经和 Docker 官方达成战略合作，Docker 可以直接部署基于 `wasmedge` 的容器。不过它是 C++ 写的，并且有很多私货，在遵守 `WASI` 基本规范的同时自行加了很多东西。

`wasmer` 更倾向于将其做得更有利于工程化，保证上游链路可以按原样直接用，为此甚至不惜代价重写了一直蔓延到 `rustc` 编译器本身的代码。但也因此魔改的过于剧烈，直接导致其维护的大量上游分支产能跟不上社区，有点割裂。但是 `wasmer` 率先做了 WASI 中心库的设施，所以一时间大家对此也很看好。
