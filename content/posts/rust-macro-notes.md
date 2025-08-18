+++
title="更注重实战的 Rust 宏笔记"
date=2024-10-27
draft=true
+++

拜 C++ 一些大型项目编写时的奇怪约定所赐，想必很多从 C++ 转过来写 Rust 的老同志都是闻“宏”色变的。相比较于 Rust 的宏，C++ 的宏更像是一个“一键查找替换”的工具，一路编译下来不会也没有办法检查宏替换前后得到的代码是否合法。

相比较于 C++ 的宏，Rust 的宏就定位上更像是一个“编译器插件”，因为它解析的不是纯粹的文本，而是受 rustc 处理过的抽象语法树（AST），这种设计可以规避掉很多 C++ 宏的问题。

不过，既然都是“编译器插件”了，想必编写 Rust 宏的难度也是有十分甚至九分的困难，光对着[宏小册](https://zjp-cn.github.io/tlborm/)干瞪眼也不是个事儿。所以，我就根据最近的一些实战经验，写一篇更注重实战的 Rust 宏笔记，希望能够帮助到一些有需要的同志。

> 这篇文章本来去年就该发了的，到现在才发是因为这里涉及的部分案例代码有在申请专利，通过之后才能放心把原理发出来具体讲解。

## 序言：容易串台的 C++ 宏

考虑这样一个案例：

```cpp
#define ADD(a, b) a + b
```

这个宏看起来很简单，但是如果你这样使用：

```cpp
int c = ADD(1, 2) * 3;
```

运行后，`c` 的值并不是 `9`，而是 `7`。因为这个宏展开后的代码是：

```cpp
int c = 1 + 2 * 3;
```

按理说，`1 + 2` 是应当先进行计算的，但直接把宏展开后的代码放进去，会出现运算符优先级导致的计算顺序错乱。

有经验的老师傅可能会说，这个问题可以通过加括号解决：

```cpp
#define ADD(a, b) (a + b)
```

但说实在的，这种坑还是太容易踩了。这还只是一个简单的加法宏，如果更复杂一些，纠错只会变得更加困难，这对于大型项目来说真的是太要命了。

## 1. Rust 的宏为何相对更靠谱？

很显然，C++ 的宏最大的问题在于它只是一个“文本替换”的工具，它不能感知给宏传递的是什么样的参数。

Rust 的宏相对而言就好了很多，因为它传入的参数是可以定义类型的：

```rust
macro_rules! add {
    ($a:expr, $b: expr) => { $a + $b };
}
```

这里的 `expr` 就指代了表达式类型。如此一来，这个宏就只能传入两个表达式作为参数了：

```rust
let c = add!(1, 2) * 3;
```

可能你会想，这好像和 C++ 宏也差不多啊，不过就是多了个类型限定。但这里与 C++ 宏的版本稍有不同的是，它会自动识别出这个宏的返回值**正在参与一个表达式的计算**，所以会自动加上括号以保证计算顺序的正确：

```rust
let c = (1 + 2) * 3;
```

并且，它能更有效地阻止一些奇怪的参数传进来：

```rust
// 以下代码均无法通过编译

let c = add!(1, 2, 3);
let c = add!(1, "2");
let c = add!(1., 2);
let c = add!(usize, f64);
```

在继续下面的实战之前，我强烈建议先阅读一下[宏小册](https://zjp-cn.github.io/tlborm/)，至少有个理论基础。

## 2. 实战，解析 `serde` 的过程宏 `#[derive(Serialize, Deserialize)]`

这应该算是 Rust 中最常用的 `derive` 宏之一了。[`serde`](https://docs.rs/serde/latest/serde/) 作为对数据结构进行序列化的前置库，只要给你的 `struct` 或 `enum` 前面的 `derive` 宏中加上 [`Serialize`](https://docs.rs/serde/latest/serde/derive.Serialize.html) 和 [`Deserialize`](https://docs.rs/serde/latest/serde/derive.Deserialize.html)，就可以自动实现序列化与反序列化的功能。配合 [`serde_json`](https://docs.rs/serde_json/latest/serde_json/)、[`toml`](https://docs.rs/toml/latest/toml/) 等基于 `serde` 的库，可以很方便地将数据结构序列化为 [JSON](https://www.json.org/json-zh.html)、[TOML](https://toml.io/cn/) 等格式。

为了实现这种能力，`serde` 同时定义了 `Serialize` 和 `Deserialize` 的宏和同名的 trait，这两个宏展开之后所做的事情其实就是自动实现这两个同名 trait。

它是怎么展开的呢？我们可以通过 `cargo expand` 或 rust-analyzer 的“Expand Macro”功能来查看：

```rust
#[derive(serde::Serialize)]
pub struct Foo {
    pub bar: String,
}
```

它展开后长这样：

```rust
// Recursive expansion of serde::Serialize macro
// ==============================================

#[doc(hidden)]
#[allow(non_upper_case_globals, unused_attributes, unused_qualifications)]
const _: () = {
    #[allow(unused_extern_crates, clippy::useless_attribute)]
    extern crate serde as _serde;
    #[automatically_derived]
    impl _serde::Serialize for Foo {
        fn serialize<__S>(
            &self,
            __serializer: __S,
        ) -> _serde::__private::Result<__S::Ok, __S::Error>
        where
            __S: _serde::Serializer,
        {
            let mut __serde_state =
                _serde::Serializer::serialize_struct(__serializer, "Foo", false as usize + 1)?;
            _serde::ser::SerializeStruct::serialize_field(&mut __serde_state, "bar", &self.bar)?;
            _serde::ser::SerializeStruct::end(__serde_state)
        }
    }
};
```

> 等下，这玩意怎么展开？
>
> 一种办法是使用 `cargo expand`，但是这个工具展开的结果可能会有点乱，因为它会递归展开所有可能碰到的宏，导致可读性变得极差，一般也只有在调试编译器 rustc 本身时才会用到。
>
> 另一种办法是使用 rust-analyzer 的“Expand Macro”功能，这个功能只会展开当前光标所在的宏。因为只做一次展开，所以可读性会好很多，便于我们单独对着某个宏进行调试。
>
> 例如，在 VSCode 中安装了 rust-analyzer 插件之后，可以按 F1 打开命令面板，搜 `rust-analyzer: Expand macro recursively at caret` 并执行，即可自动展开光标所在位置的宏。

这部分代码单纯就只是在实现 `Serialize` trait，读取到这个结构中唯一的一个键 `bar` 之后，将其序列化到 `__serializer` 中。

怎么说呢……这展开之后的玩意还真不是人看的，充斥着各种下划线开头的私有变量名，并且最外头还包了一层 `const _: () = { ... };` 以匿名形式隔离作用域。

那这个宏又是怎么解析的呢？从这个宏的入口开始看：

```rust
#[proc_macro_derive(Serialize, attributes(serde))]
pub fn derive_serialize(input: TokenStream) -> TokenStream {
    let mut input = parse_macro_input!(input as DeriveInput);
    ser::expand_derive_serialize(&mut input)
        .unwrap_or_else(syn::Error::into_compile_error)
        .into()
}
```

## 3. 实战，解析 `yuuka` 的过程宏 `derive_struct!`

## 4. 实战，解析 `yew` 的过程宏 `html!`

## 结语：Rust 宏的未来
