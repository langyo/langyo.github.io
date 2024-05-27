+++
title="基于 Rust 的 WebAssembly 使用指南"
date=2024-05-27
draft=false
+++

时隔许久，尽管我已经在此期间成功上线了好几个纯 Rust 编写的 Web 服务，但一直没能抽空整理与此相关的基础设施的入门指南。不同于隔壁 JavaScript 娱乐圈每天都能有人整活，Rust 这边不论是要做浏览器还是 WebAssembly 的基础设施都还是非常缺人的，自然也就没有卖课的去关注这方面内容。索性，我决定就如何以 Rust 在浏览器中实现异步操作做个简单的知识梳理。

老实说，[MDN 上的那篇教程](https://developer.mozilla.org/en-US/docs/WebAssembly)其实已经有点过时了，但这是 Rust 这里的基础设施更新太快太激进导致的。我这次写这篇博客就是为了应对这种情况，不要纠结于过时的教程。

## 1. `WebAssembly` 的背景

## 2. 什么是 `wasm_bindgen`？

## 3. 与浏览器直接交互的包装接口 `web_sys` 与 `js_sys`

## 4. 异步支持 `wasm_bindgen_futures`

## 5. 过去的 `wasm-pack` 与现在的 `trunk`

## 6. 手动编译打包手段 `wasm-bindgen-cli`

## 7. 以类似 `React` 的渲染库 `yew` 构建界面

## 8. 以类似 `imgui` 的库 `egui` 构建界面

## 9. 来自未来的 `WASI` 与 `wasmtime`
