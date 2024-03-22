+++
title="以 Rust 对 Windows 程序注入 Hook 的方法"
date=2024-03-22
draft=false
+++

有关以 Rust 语言进行各种逆向注入的研究，我断断续续拿零碎时间研究了一年，现在总算拼凑了些成果可以讲讲。~~其实这文章是为了我能留住 52破解的论坛账号才写的，免得又被当成机器人误删。~~

Rust 是一门十分讲究安全的语言，看起来它与逆向工程这种听起来就很不安全的事情似乎有些水火不容，以至于我第一次向他人提出这个想法时，大家的反应基本是不太接受的。不过比起拿 C++ 做，Rust 有个很大的优势是很容易做工程——C++ 的生态过于离谱，IDE、编译器、链接器和依赖库全都不在一个阵线上，相比较而言 Rust 就方便太多了。

碎碎念完了，下面就大概讲一下思路吧。

以下过程的最终代码存放在了[我的 Github 仓库](https://github.com/langyo/rust-winhook-demo)。

## 1. 准备一个用于注入的 DLL

为了能侵入修改我们要改动的目标进程，我们首先需要制作一个动态链接库（DLL）。这个 DLL 会被注入到目标进程的地址空间中，然后在目标进程中执行我们的代码。

毕竟，在保护模式下，如果我们写的程序和目标程序不在一个地址空间，那怎么也没办法直接修改目标程序的内存。

在正式开始前，先准备个空文件夹作为整个工作集的根目录。我们在这个根目录新建一个 `Cargo.toml`，并在里头写上有关 `workspace` 的配置：

```toml
[workspace]
members = [
    "_dll",
    "rust-winhook-demo-core",
    "_injector",
]
```

下面以 `cargo new` 创建一个 DLL 项目 `_dll`，然后在 `Cargo.toml` 中添加 `windows` 依赖：

```toml
[lib]
crate-type = ["cdylib"]

[dependencies]
windows = { version = "^0.54", features = [
    "Win32_Foundation",
    "Win32_System_LibraryLoader",
    "Win32_System_SystemServices",  # 这些 features 可以根据自己需要增减
] }
```

注意这里我们要将 `crate-type` 字段设置为 `cdylib`，这样我们才能生成一个以 C 风格 ABI 编译的 DLL。这一点很重要，因为 Rust 默认生成的是其特有的 `dylib`，尽管它直接可以用于 Rust 编译链接的联动，但这种库是不符合 Windows 的标准的。

然后我们新建 `src/lib.rs`，写入以下代码：

```rust
#![cfg(windows)]

use std::os::raw::c_void;

use windows::Win32::{
    Foundation::{BOOL, HANDLE},
    System::SystemServices::{
        DLL_PROCESS_ATTACH, DLL_PROCESS_DETACH, DLL_THREAD_ATTACH, DLL_THREAD_DETACH,
    },
};

#[no_mangle]
unsafe extern "system" fn DllMain(_hinst: HANDLE, reason: u32, _reserved: *mut c_void) -> BOOL {
    match reason {
        DLL_PROCESS_ATTACH => {
            println!("DLL_PROCESS_ATTACH");
        },
        DLL_PROCESS_DETACH => {
            println!("DLL_PROCESS_DETACH");
        }
        DLL_THREAD_ATTACH => {}
        DLL_THREAD_DETACH => {}
        _ => {}
    };
    BOOL::from(true)
}
```

> 对于[**库**类型的项目](https://doc.rust-lang.org/reference/linkage.html)，入口为 `src/lib.rs` 而非 `src/main.rs`，注意区分。以 `cargo new` 新建项目时默认会创建一个 `main.rs`，这个文件可以删除掉，不会影响项目的编译。[这里](https://rustmagazine.github.io/rust_magazine_2022/Q1/contribute/rust-dyn-link.html)有更详细的有关 Rust 的各种链接库目标的介绍。

这算是一个最简单的 DLL 了。它会在被加载时输出 `DLL_PROCESS_ATTACH`，卸载时输出 `DLL_PROCESS_DETACH`。

下面我会准备两个部分，一个用于实验 EAT Hook，另一个用于实验 inline Hook。

稍微科普一下，EAT Hook 是指修改导入表中的函数地址，使得目标程序在调用某个函数时，实际上调用的是我们的函数。这种 Hook 是最简单的，但是也最容易被杀软检测到。inline Hook 则是直接修改目标函数的代码，使得目标函数在执行时跳转到我们的函数。这种 Hook 的优点是不容易被检测到，但是实现起来比较复杂。

## 2. 画一个用于注入 EAT Hook 的靶子

按理说以 C 语言编写的程序是最容易被注入的，但是我这里还是用 Rust 来写~~，不然怎么上强度呢~~。

以 `cargo new` 新建一个项目 `rust-winhook-demo-core`，然后照常加入`windows` 依赖：

```toml
[package]
name = "rust-winhook-demo-core"
version = "0.1.0"
edition = "2021"

[dependencies]
windows = { version = "^0.54", features = [
    "Win32_Foundation",
    "Win32_System_LibraryLoader",
] }
```

> 为什么名字这么长？后续运行注入程序时，我需要根据这个名字来找到这个程序的对应进程。如果名字太短，可能会跟系统中的其它已有进程名字冲突，找错程序就尴尬了。

然后在 `src/main.rs` 中写入以下代码：

```rust
use windows::{core::*, Win32::System::LibraryLoader::LoadLibraryA};

fn main() {
    println!("等一秒时间让钩子挂上去");
    std::thread::sleep(std::time::Duration::from_millis(1000));

    println!("尝试加载 kernel32.dll");
    unsafe {
        let _ = LoadLibraryA(PCSTR(b"kernel32.dll\0".as_ptr() as _));
    }
    println!("加载完成");
}
```

## 3. 编写 EAT Hook 的逻辑

接下来我们回到 DLL 项目，先加一个极为重要的依赖 `retour`。这个库类似 C++ 中的 `easyhook`，可以帮助我们实现注入和 Hook。

```toml
retour = { version = "^0.3", features = ["static-detour"] }
once_cell = "^1" # 顺便加一个这个库，用于懒加载
```

> `retour` 这个库实际上是 `detour` 库的一个分支，因为原作者常年走丢，所以有个新作者接手了这个项目，并以另一个名字上传到了 [crates.io](https://crates.io/crates/retour)。

我们先准备 EAT Hook 的实验：

```rust
use once_cell::sync::Lazy;
use std::ffi::CStr;

use retour::GenericDetour;
use windows::{
    core::PCSTR,
    Win32::{
        Foundation::HMODULE,
        System::LibraryLoader::{GetProcAddress, LoadLibraryA},
    },
};

type HookFnType = extern "system" fn(PCSTR) -> HMODULE;

pub static hooker: Lazy<GenericDetour<HookFnType>> = Lazy::new(|| {
    let library_handle = unsafe { LoadLibraryA(PCSTR(b"kernel32.dll\0".as_ptr() as _)) }.unwrap();
    let address = unsafe { GetProcAddress(library_handle, PCSTR(b"LoadLibraryA\0".as_ptr() as _)) };
    let ori: HookFnType = unsafe { std::mem::transmute(address) };
    unsafe { GenericDetour::new(ori, our_LoadLibraryA).unwrap() }
});

extern "system" fn our_LoadLibraryA(lpFileName: PCSTR) -> HMODULE {
    let file_name = unsafe { CStr::from_ptr(lpFileName.as_ptr() as _) }; // 从 C 字符串指针读取并转换为 Rust 字符串
    println!("要加载的库名称： {:?}", file_name);

    unsafe { hooker.disable().unwrap() }; // 先临时解除钩子，以便我们能调用原版的 LoadLibraryA

    let ret_val = hooker.call(lpFileName);
    println!("调用原版 LoadLibraryA 返回的地址： {:#X}", ret_val.0);

    unsafe { hooker.enable().unwrap() }; // 重新再把钩子上回去
    ret_val
}
```

加载 `kernel32.dll` 这个过程对应的是 EAT hook 的实验，如果注入成功，我们可以临时偷偷更换掉 `LoadLibraryA` 的地址，使得目标程序在调用 `LoadLibraryA` 时实际上调用的是我们的函数。侦测到加载后就原样调用原版的 `LoadLibraryA`，参数和返回值都先不篡改，这样就不会影响目标程序的正常运行。

然后我们需要在 DLL 入口处初始化这个钩子，就加在 `DllMain` 函数里面的 `DLL_PROCESS_ATTACH` 分支里，也就是一加载好 DLL 就立即挂上钩子：

```rust
#[no_mangle]
unsafe extern "system" fn DllMain(_hinst: HANDLE, reason: u32, _reserved: *mut c_void) -> BOOL {
    match reason {
        DLL_PROCESS_ATTACH => unsafe {
            hooker.enable().unwrap();   // 启动时挂上钩子
        },
        DLL_PROCESS_DETACH => {
            hooker.disable().unwrap();  // 卸载时解除钩子
        }
        DLL_THREAD_ATTACH => {}
        DLL_THREAD_DETACH => {}
        _ => {}
    };
    BOOL::from(true)
}
```

## 4. 编写协助挂载 DLL 的程序

最后我们需要一个程序来帮助我们将 DLL 注入到目标程序中。这个程序需要有足够的权限，以及能够打开目标进程并将 DLL 注入到目标进程中。

首先再建一个 Rust 项目，然后在 `Cargo.toml` 中添加 `dll-syringe` 依赖：

```toml
[package]
name = "_injector"
version = "0.1.0"
edition = "2021"

[dependencies]
dll-syringe = "^0.15"
```

然后在 `src/main.rs` 中写入以下代码：

```rust
use dll_syringe::{
    process::{OwnedProcess, Process},
    Syringe,
};

fn main() {
    std::process::Command::new({
        // 根据编译时选择的指令集架构，选择不同的目标程序
        if cfg!(target_arch = "x86") {
            "target/i686-pc-windows-msvc/release/rust-winhook-demo-core.exe"
        } else {
            "target/release/rust-winhook-demo-core.exe"
        }
    })
    .spawn()
    .unwrap();

    // 先找到目标进程的 PID
    let target_process = OwnedProcess::find_first_by_name("rust-winhook-demo-core").unwrap();
    println!(
        "目标进程 ID： {}",
        target_process.pid().unwrap()
    );

    // 初始化注入器
    let syringe = Syringe::for_process(target_process);

    // 注入 DLL
    let injected_payload = syringe
        .inject({
            // 这里也是根据编译时选择的指令集架构，选择不同的 DLL
            if cfg!(target_arch = "x86") {
                "target/i686-pc-windows-msvc/release/_dll.dll"
            } else {
                "target/release/_dll.dll"
            }
        })
        .unwrap();
    if injected_payload.guess_is_loaded() {
        println!("注入成功");
    } else {
        println!("注入失败");
    }
}
```

在正式运行注入程序之前，我们需要先编译 DLL 和被注入的程序。

> 注意这里我们需要使用 nightly 版本的 Rust，因为这些库都用了一些不稳定特性。如果你没有安装 nightly 版本的 Rust，可以使用 `rustup toolchain install nightly` 安装。
>
> 如果你想编译与运行 32 位版本的程序，可以使用 `rustup target add i686-pc-windows-msvc` 安装 32 位的编译目标。

```bash
cargo +nightly build -p _dll --release
cargo +nightly build -p rust-winhook-demo-core --release
```

然后我们就可以运行注入程序了：

```bash
cargo +nightly run -p _injector --release
```

## 5. 画一个用于 inline Hook 的靶子

接下来我们准备 inline Hook 的实验。修改一下 `rust-winhook-demo-core` 项目的 `src/main.rs`：

```rust
#[no_mangle]
#[inline(never)]
pub extern "C" fn add_42(x: i32) -> i32 {
    x + 42
}

fn main() {
    println!("add_42 的内存地址是： 0x{:x}", add_42 as usize);

    println!("等一秒时间让钩子挂上去");
    std::thread::sleep(std::time::Duration::from_millis(1000));

    let result = add_42(100);
    println!("add_42(100) = {}", result);

    println!("调用完成");
}
```

按正常的逻辑，`add_42` 函数执行后会返回传入的数字加上 42 后的结果。我们接下来的目标是把它的返回值改为固定的数字 233333。

## 6. 编写 inline Hook 的逻辑

我们先回到 DLL 项目，把原来的 EAT Hook 改掉：

```rust
use std::sync::{Arc, Mutex};
use once_cell::sync::Lazy;
use retour::GenericDetour;

type HookFnType = extern "C" fn(i32) -> i32;

static hooker: Lazy<Arc<Mutex<Option<GenericDetour<HookFnType>>>>> =
    Lazy::new(|| Arc::new(Mutex::new(None)));

extern "C" fn our_add_42(_input: i32) -> i32 {
    let hooker_inside = hooker.clone();

    unsafe {
        hooker_inside
            .lock()
            .unwrap()
            .as_ref()
            .unwrap()
            .disable()
            .unwrap()
    };

    let ret_val = 233333;
    println("已注入");

    unsafe {
        hooker_inside
            .lock()
            .unwrap()
            .as_ref()
            .unwrap()
            .enable()
            .unwrap()
    };

    ret_val
}
```

然后在 `DllMain` 函数里面的 `DLL_PROCESS_ATTACH` 分支里面初始化这个钩子：

```rust
#[no_mangle]
unsafe extern "system" fn DllMain(_hinst: HANDLE, reason: u32, _reserved: *mut c_void) -> BOOL {
    match reason {
        DLL_PROCESS_ATTACH => unsafe {
            let address = 0x000000; // 通过直接运行程序，看终端输出的日志来获取一个未混淆的地址，仅适用于 32 位程序

            println!("即将挂钩的地址： {:#X}", address);
            let ori: HookFnType = unsafe { std::mem::transmute(address) };
            hooker.clone().lock().unwrap().replace(unsafe {
                let ret = GenericDetour::new(ori, our_add_42).unwrap();
                ret.enable().unwrap();
                ret
            });
        },
        DLL_PROCESS_DETACH => {
            hooker.clone().lock().unwrap().as_ref().unwrap().disable().unwrap();
        }
        DLL_THREAD_ATTACH => {}
        DLL_THREAD_DETACH => {}
        _ => {}
    };
    BOOL::from(true)
}
```

剩下的流程和 EAT Hook 差不多，`_injector` 不需要改动，直接运行即可。

## 7. 与 DLL 建立 IPC 通信

在实际的应用中，我们可能需要与 DLL 建立 IPC 通信，以便动态指挥 DLL 做一些事情。

由于这部分内容其实和 Hook 技术关系不是很大，所以我就不在这里展开讲了。不过我还是会简单分享一下我用的方案。

这里我用的是 `interprocess` 这个库，具体如何使用可以参考[官方文档](https://docs.rs/interprocess/latest/interprocess/)和[我写的一些 Demo](https://github.com/langyo/rust-ipc-demo)。

我还写了一个比较方便的脚手架代码，暂时还没做成单独发布。我在 Github 上有关这个文章的 Demo [也有用上](https://github.com/langyo/rust-winhook-demo/blob/8657aef2ba737c0f317eaac73db7492ebbb13008/packages/utils/src/pipe.rs)：

```rust
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::io::{prelude::*, BufReader, ErrorKind};

use interprocess::local_socket::{LocalSocketListener, LocalSocketStream, NameTypeSupport};

pub struct Pipe {
    conn: BufReader<LocalSocketStream>,
    buffer: [u8; 1024],
}

impl Pipe {
    pub fn new(conn: LocalSocketStream) -> Self {
        let conn = BufReader::new(conn);
        let buffer = [0; 1024];
        Pipe { conn, buffer }
    }

    fn do_write<T: Serialize>(&mut self, data: &T) -> Result<()> {
        let data = postcard::to_allocvec(data)?;

        let len = data.len();
        let (len, chunks_len) = (len, len / 1024 + if len % 1024 == 0 { 0 } else { 1 });
        self.conn
            .get_mut()
            .write_all(&postcard::to_allocvec(&(len, chunks_len))?)?;
        self.conn.get_mut().flush()?;

        for chunk in data.chunks(1024) {
            self.conn.get_mut().write_all(chunk)?;
            self.conn.get_mut().flush()?;
        }

        let ack = "ACK".as_bytes();
        self.conn.get_mut().write_all(&ack)?;
        self.conn.get_mut().flush()?;

        Ok(())
    }

    fn do_read<T: for<'de> Deserialize<'de>>(&mut self) -> Result<T> {
        self.conn.read(&mut self.buffer)?;
        let (len, chunks_len): (usize, usize) = postcard::from_bytes(&self.buffer)?;
        self.buffer = [0; 1024];

        let mut data = Vec::with_capacity(len);

        for _ in 0..chunks_len {
            self.conn.read(&mut self.buffer)?;
            data.extend_from_slice(&self.buffer);

            self.buffer = [0; 1024];
        }

        self.conn.read(&mut self.buffer)?;
        if &self.buffer[0..3] != "ACK".as_bytes() {
            return Err(anyhow!("No ACK"));
        }
        self.buffer = [0; 1024];

        Ok(postcard::from_bytes(&data[0..len])?)
    }

    pub fn write<T: Serialize>(&mut self, data: &T) -> Result<()> {
        self.do_write(data).map_err(|err| {
            log::error!("Pipe failed to write: {:?}", err);
            err
        })
    }

    pub fn read<T: for<'de> Deserialize<'de>>(&mut self) -> Result<T> {
        self.do_read().map_err(|err| {
            log::error!("Pipe failed to read: {:?}", err);
            err
        })
    }
}

pub fn create_client(name: String) -> Result<Pipe> {
    let name = {
        use NameTypeSupport::*;
        match NameTypeSupport::query() {
            OnlyPaths => format!("/tmp/{name}.sock"),
            OnlyNamespaced | Both => format!("@{name}.sock"),
        }
    };

    let conn = LocalSocketStream::connect(name.clone())?;

    log::info!("Connected to {}", name);

    Ok(Pipe::new(conn))
}

pub fn create_server(name: String) -> Result<Pipe> {
    let name = {
        use NameTypeSupport::*;
        match NameTypeSupport::query() {
            OnlyPaths => format!("/tmp/{name}.sock"),
            OnlyNamespaced | Both => format!("@{name}.sock"),
        }
    };

    let listener = match LocalSocketListener::bind(name.clone()) {
        Ok(ret) => ret,
        Err(e) if e.kind() == ErrorKind::AddrInUse => {
            return Err(anyhow!("Address already in use"));
        }
        Err(e) => return Err(e.into()),
    };

    log::info!("Server running at {}", name);

    if let Some(Ok(conn)) = listener.incoming().next() {
        log::info!("Incoming connection at {}", name);

        Ok(Pipe::new(conn))
    } else {
        Err(anyhow!("No incoming connection"))
    }
}
```

简而言之，IPC 的缓冲区没办法开的太大，所以我就把数据分块传输了。这个库的使用方法也很简单，就是创建一个 `Pipe` 对象，然后调用 `write` 和 `read` 方法即可：

```rust
// 在客户端
let conn = create_client("<xxx>".to_string()).unwrap();
conn.write(&xxx).unwrap();
let ret: XXX = conn.read().unwrap();

// 在服务端
let mut conn = create_server("<xxx>".to_string()).unwrap();
let ret: XXX = conn.read().unwrap();
conn.write(&xxx).unwrap();
```

## 8. 结语

写博客挺麻烦的，平时很忙，不过我还是尽量写了下。希望这些心得能帮到你吧，感谢阅读。
