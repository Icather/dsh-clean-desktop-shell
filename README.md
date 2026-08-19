<div align="center">

# dsh-clean-desktop-shell

**DeepSeek Harness 的干净毛玻璃桌面壳（DSH 插件形态）**

复用你现有的 web profile，Mica / vibrancy 原生毛玻璃透出壁纸。壳与内核解耦：默认加载本地 `127.0.0.1:3080`，也可连接任意远程 DSH 服务。

[English](README.en.md) · [中文](README.md)

[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-0078D6?logo=windows&logoColor=white)](https://github.com/Icather/dsh-clean-desktop-shell)
[![License](https://img.shields.io/badge/License-MIT-22c55e)](LICENSE)
[![Release](https://img.shields.io/github/v/release/Icather/dsh-clean-desktop-shell?color=blue)](https://github.com/Icather/dsh-clean-desktop-shell/releases/latest)
[![DSH](https://img.shields.io/badge/DeepSeek_Harness-rc.7-4D6BFE)](https://github.com/deepseek-ai/deepseek-harness)

</div>

## 这是什么

`dsh-clean-desktop-shell` 是一个 **DSH 插件形态** 的桌面壳：它给已经跑起来的 DSH Web（默认 `http://127.0.0.1:3080`）套一层原生桌面窗口——**Mica（Windows 11）/ vibrancy（macOS）毛玻璃透壁纸**，带系统托盘、单实例、开机自启，像普通桌面软件一样使用。

与生态里其他桌面端方案的最大区别：

| | 其他桌面端（如 dsh-desktop 系列） | 本插件 |
|:--|:--|:--|
| **形态** | 独立 Electron 应用，自带独立 profile | **DSH 插件**，挂载进现有 profile |
| **Profile** | 新建 desktop profile，插件/配置要重装 | **复用现有 web profile**，零迁移 |
| **毛玻璃** | 多数未实现 | **Mica / vibrancy 原生材质** |
| **跟随上游** | 固定版本 | **跟随 rc.7** |

## 架构

```
        ┌──────────────────── 内核（dsh web / headless 服务） ────────────────────┐
        │  会话 · Agent · 插件 · 记忆 都在这层，与界面解耦                          │
        └─────────────────────────────────────────────────────────────────────────┘
                              ▲
              ┌───────────────┴───────────────┐
              │    dsh-clean-desktop-shell     │
              │   Electron 壳（客户端）          │
              │   Win: Mica · macOS: vibrancy  │
              └────────────────────────────────┘
```

- **默认**：加载本地 `127.0.0.1:3080`（已配置好的 web profile，零迁移）。
- **可配远程**：在设置里填入任意远程 DSH 地址，壳只当窗口——手机 / Linux / 其他设备通过浏览器或 PWA 也能接入内核，壳本身不绑定本地服务。

### 平台矩阵

| 平台 | 壳 | 毛玻璃 | 状态 |
|:--|:--|:--|:--|
| Windows 11 | ✅ Electron | Mica | 首发目标 |
| macOS | ✅ Electron | vibrancy | 规划中 |
| Linux | —（浏览器 / PWA 直连内核） | — | 不做 |
| Termux / 手机 / 平板 | —（headless / PWA 直连内核） | — | 由内核远程访问支持 |

## 安装

```sh
dsh plugin --profile web add dsh-clean-desktop-shell
```

重启 `dsh web` 后，从系统托盘/快捷方式启动桌面壳即可。

> 桌面壳需要本机有可用的 `dsh web` 服务（或配置的远程地址）。见下方「使用」。

## 使用

1. 启动 `dsh web`（或配置远程服务地址）。
2. 启动桌面壳：自动检测本地 3080；未运行时按配置拉起服务。
3. 窗口右上角控制：最小化 / 最大化 / 关闭（关闭默认缩到托盘）。

## 开发

```sh
npm install
npm run build   # 构建插件 bundle
npm run pack    # 打包 NSIS (Win) + DMG (mac)
```

## 更新历史

### 0.1.0
- 初始版本：Electron 壳骨架，Mica / vibrancy 窗口材质，DSH 插件挂载。

## 致谢

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) —— 内核本体。
- 架构参考 [Hermes Agent Desktop](https://github.com/NousResearch/hermes-agent) 的壳/内核分离设计。
