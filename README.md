<div align="center">

# dsh-clean-desktop-shell

**DeepSeek Harness 的纯净桌面壳（DSH 插件形态）**

只做一件事：给已配置好的 DSH Web 加一层干净的桌面窗口——系统托盘、单实例、开机自启、像普通软件一样用。无毛玻璃、无花哨材质，**纯净**。

[English](README.en.md) · [中文](README.md)

[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-0078D6?logo=windows&logoColor=white)](https://github.com/Icather/dsh-clean-desktop-shell)
[![License](https://img.shields.io/badge/License-MIT-22c55e)](LICENSE)
[![Release](https://img.shields.io/github/v/release/Icather/dsh-clean-desktop-shell?color=blue)](https://github.com/Icather/dsh-clean-desktop-shell/releases/latest)
[![DSH](https://img.shields.io/badge/DeepSeek_Harness-rc.7-4D6BFE)](https://github.com/deepseek-ai/deepseek-harness)

</div>

## 这是什么

`dsh-clean-desktop-shell` 是一个 **DSH 插件形态** 的纯净桌面壳：它给已经跑起来的 DSH Web（默认 `http://127.0.0.1:3080`）套一层原生桌面窗口——系统托盘、单实例、开机自启，像普通桌面软件一样使用。**不做任何视觉改造**：不加毛玻璃、不改界面，纯粹是"窗口壳"。

与生态里其他桌面端方案的最大区别：

| | 其他桌面端（如 dsh-desktop 系列） | 本插件 |
|:--|:--|:--|
| **形态** | 独立 Electron 应用，自带独立 profile | **DSH 插件**，挂载进现有 profile |
| **Profile** | 新建 desktop profile，插件/配置要重装 | **复用现有 web profile**，零迁移 |
| **视觉改造** | 自绘标题栏 / 毛玻璃等 | **零改造**，纯净窗口壳 |
| **跟随上游** | 固定版本 | **跟随 rc.7** |

## 架构

```
        ┌──────────────────── 内核（dsh web / headless 服务） ────────────────────┐
        │  会话 · Agent · 插件 · 记忆 都在这层，与界面解耦                          │
        └─────────────────────────────────────────────────────────────────────────┘
                              ▲
              ┌───────────────┴───────────────┐
              │   dsh-clean-desktop-shell      │
              │   Electron 壳（客户端）          │
              │   托盘 · 单实例 · 开机自启       │
              └────────────────────────────────┘
```

- **默认**：加载本地 `127.0.0.1:3080`（已配置好的 web profile，零迁移）。
- **可配远程**：在设置里填入任意远程 DSH 地址，壳只当窗口——手机 / Linux / 其他设备通过浏览器或 PWA 也能接入内核，壳本身不绑定本地服务。

### 平台矩阵

| 平台 | 壳 | 状态 |
|:--|:--|:--|
| Windows | ✅ Electron（无边框 + 原生窗口按钮） | 已发布（NSIS 安装包） |
| macOS | ✅ Electron（hiddenInset） | 已发布（CI 构建 Intel + Apple Silicon DMG） |
| Linux | —（浏览器 / PWA 直连内核） | 不做 |
| Termux / 手机 / 平板 | —（headless / PWA 直连内核） | 由内核远程访问支持 |

## 安装

```sh
dsh plugin --profile web add dsh-clean-desktop-shell
```

重启 `dsh web` 后，从系统托盘/快捷方式启动桌面壳即可。

> 桌面壳需要本机有可用的 `dsh web` 服务（或配置的远程地址）。见下方「使用」。

## 使用

1. 启动 `dsh web`（或配置远程服务地址）。
2. 启动桌面壳：自动检测本地 3080；未运行时按配置拉起服务。
3. 窗口顶部（右侧留系统按钮）可拖动窗口；关闭默认缩到托盘。

**后端的一切操作都在托盘右键**，主窗口保持纯壳：

- 启动 / 重启 / 关闭后端（带进度弹窗；关闭会真正停掉 3080 上的服务，包括外部启动的实例）
- 自动探测后端 · 设置后端安装文件夹（默认自动探测定位）
- 刷新窗口 · 检查更新 · 仓库主页 · 开机自启

**窗口的可靠性（Edge 式即时刷新）**：

- 双击启动立即出窗，不等后端就绪
- 后端没起来时显示「后端未连接」页，自动探测；后端一通立即加载
- 后端关闭 / 被杀的一刻，窗口立刻切回离线页——不会停在旧页面假装还活着
- 离线页内置快捷按钮：重新加载 / 启动后端 / 自动探测后端 / 设置后端安装文件夹

## 开发

```sh
npm install
npm run build   # 构建插件 bundle
npm run dev     # 启动壳（开发模式）
npm run pack    # 打包 NSIS (Win) / DMG (mac)
```

## 更新历史

### 0.1.1
- 后端生命周期：修复 Windows 下启动报 `spawn EINVAL`、卡「启动中」的问题；「关闭后端」现在能真正停掉后端（含外部启动的实例）；启动 / 重启 / 关闭带进度弹窗。
- 窗口可靠性：双击立即出窗；后端关闭窗口立刻切离线黑屏；后端恢复自动重连（Edge 式即时刷新）。
- 离线页自助：重新加载 / 启动后端 / 自动探测后端 / 设置后端安装文件夹。
- 托盘：新增「刷新窗口」；macOS 构建发布（Intel + Apple Silicon DMG）。

### 0.1.0
- 初始版本：Electron 壳骨架，系统托盘/单实例/开机自启，DSH 插件挂载。

## 致谢

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) —— 内核本体。
- 架构参考 [Hermes Agent Desktop](https://github.com/NousResearch/hermes-agent) 的壳/内核分离设计。
