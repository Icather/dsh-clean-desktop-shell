<div align="center">

# dsh-clean-desktop-shell

**DeepSeek Harness 的纯净桌面壳（DSH 插件形态）**

只做一件事：给已配置好的 DSH Web 加一层干净的桌面窗口——系统托盘、单实例、像普通软件一样用。无毛玻璃、无花哨材质，**纯净**。

[English](README.en.md) · [中文](README.md)

[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-0078D6?logo=windows&logoColor=white)](https://github.com/Icather/dsh-clean-desktop-shell)
[![License](https://img.shields.io/badge/License-MIT-22c55e)](LICENSE)
[![Release](https://img.shields.io/github/v/release/Icather/dsh-clean-desktop-shell?color=blue)](https://github.com/Icather/dsh-clean-desktop-shell/releases/latest)
[![DSH](https://img.shields.io/badge/DeepSeek_Harness-rc.7-4D6BFE)](https://github.com/deepseek-ai/deepseek-harness)
[![Contributors](https://img.shields.io/github/contributors/Icather/dsh-clean-desktop-shell?color=blueviolet)](https://github.com/Icather/dsh-clean-desktop-shell/graphs/contributors)

</div>

## 这是什么

`dsh-clean-desktop-shell` 是一个 **DSH 插件形态** 的纯净桌面壳：它给已经跑起来的 DSH Web（默认 `http://127.0.0.1:3080`）套一层原生桌面窗口——系统托盘、单实例，像普通桌面软件一样使用。**不做任何视觉改造**：不加毛玻璃、不改界面，纯粹是"窗口壳"。

与生态里其他桌面端方案的最大区别：

| | 其他桌面端（如 dsh-desktop 系列） | 本插件 |
|:--|:--|:--|
| **形态** | 独立 Electron 应用，自带独立 profile | **DSH 插件**，挂载进现有 profile |
| **Profile** | 新建 desktop profile，插件/配置要重装 | **复用现有 web profile**，零迁移 |
| **视觉改造** | 自绘标题栏 / 毛玻璃等 | **零改造**，纯净窗口壳 |
| **跟随上游** | 固定版本 | **跟随 rc.7** |

## 使用

1. 若安装过插件，命令行启动 `dsh` 自动弹出桌面窗口；也可通过插件创建的桌面快捷方式双击，媲美原生桌面端的体验。
2. 使用原网页端的一切功能。
3. 托盘右键可以进行详细设置。主窗口不添加任何控件，保持页面纯净。

**后端的一切操作都在托盘右键**，主窗口保持纯壳：

- 启动 / 重启 / 关闭后端（带进度弹窗；关闭会真正停掉 3080 上的服务，包括外部启动的实例）
- 自动探测后端 · 设置后端安装文件夹（默认自动探测定位）
- 刷新窗口 · 创建桌面快捷方式 · 检查更新 · 仓库主页

**窗口的可靠性（Edge 式即时刷新）**：

- 双击启动立即出窗，不等后端就绪
- 后端没起来时显示「后端未连接」页，自动探测；后端一通立即加载
- 后端关闭 / 被杀的一刻，窗口立刻切回离线页——不会停在旧页面假装还活着
- 离线页内置快捷按钮：重新加载 / 启动后端 / 自动探测后端 / 设置后端安装文件夹

## 安装

**方式一：从 Release 下载安装包（想要独立桌面应用的用户）**

- Windows：下载 `DSH-Clean-Desktop-Shell-Setup-<版本>.exe`
- macOS：下载 `DSH-Clean-Desktop-Shell-<版本>.dmg`（Intel）或 `-arm64.dmg`（Apple Silicon）

安装包会**自动创建桌面快捷方式**，并提供系统托盘等完整桌面体验。首次运行 Windows 安装包可能触发 SmartScreen 警告——**这是未签名程序的正常现象，不是病毒**，见下方「Windows SmartScreen 警告说明」。

**方式二：作为 DSH 插件安装（DSH 生态用户）**

```sh
dsh plugin --profile web add dsh-clean-desktop-shell
```

重启 `dsh web` 后，桌面壳窗口会**自动弹出**（首次运行需联网准备 Electron 运行时，约 1-2 分钟）。

> 方式二得到的是"随 DSH 启动的桌面壳"：窗口由插件在 `dsh web` 启动时自动拉起，**不产生独立安装包 / 桌面图标**。想要可双击启动、带桌面快捷方式和自动更新的独立应用，请用方式一。两种方式的核心窗口体验一致。

> 桌面壳需要本机有可用的 `dsh web` 服务（或配置的远程地址）。见下方「使用」。

### Windows SmartScreen 警告说明

**为什么会看到警告？**

我们的安装包**没有代码签名证书**（个人开源项目暂未购买，证书年费约数百美元）。Windows 的 Microsoft Defender SmartScreen 是一个**信誉系统**——它根据"下载量 + 干净运行的记录"判断一个程序是否可信。对下载量少、未签名的 exe，它无法确认信誉，就会警告。**这不代表文件有病毒**：本项目完全开源，代码可审阅，也可本地构建比对（见下）。

**Edge 下载时会看到：**

下载面板里该文件被标记为"不常下载的文件"，需要手动保留：

1. 悬停下载项，点击右侧的 `...` 菜单
2. 选择「保留」（Keep）
3. 弹窗确认，选择「仍要保留」（Keep anyway）

**双击安装时会看到：**

蓝色对话框「Windows 已保护你的电脑」——Microsoft Defender SmartScreen 阻止了无法识别的应用启动：

1. 点击「更多信息」（More info）
2. 核对文件名确实是 `DSH-Clean-Desktop-Shell-Setup-<版本>.exe`
3. 点击「仍要运行」（Run anyway）

**备选：一次性解除锁定（推荐）**

右键安装包 → 属性 → 常规 → 底部勾选「解除锁定」→ 确定。之后双击不再有警告。

或 PowerShell 批量解除：

```powershell
Unblock-File -Path "$env:USERPROFILE\Downloads\DSH-Clean-Desktop-Shell-Setup-*.exe"
```

**关于文件安全性的说明**

安装包由 GitHub Actions 从本仓库源码自动构建（见 `.github/workflows/build.yml`），代码完全开源可审阅。如仍有疑虑，可自行 `git clone` 后按「开发」一节本地构建比对，或稍等下载量积累——SmartScreen 信誉度上去后警告会自动消失。

> 说明：代码签名证书（EV 或 Azure Trusted Signing）可以彻底消除这个警告，但需要付费且对个人开源维护者不划算。本仓库会在条件允许时考虑接入签名。

## 架构

```
        ┌────────────── 内核（dsh web / headless 服务）──────────────┐
        │     会话 · Agent · 插件 · 记忆 都在这层，与界面解耦          │
        └───────────────────────────┬──────────────────────────────┘
                                    │  http://127.0.0.1:3080（或远程地址）
                                    ▼
        ┌───────────────────────────────────────────────────────────┐
        │            dsh-clean-desktop-shell（Electron 壳）          │
        │       托盘 · 单实例 · 离线自动重连 · 桌面快捷方式            │
        │                                                           │
        │    同一份壳代码，两种分发形态：                              │
        │     ├─ 安装包版：独立 exe，双击即用，自动更新                │
        │     └─ 插件版：随 dsh web 启动自动弹窗（自管 Electron 运行时）│
        └───────────────────────────────────────────────────────────┘
```

- **壳 / 内核分离**：壳只负责窗口、托盘、后端管理；会话、Agent、插件、记忆都在内核层，与界面解耦。
- **默认**：加载本地 `127.0.0.1:3080`（已配置好的 web profile，零迁移）。
- **可配远程**：在设置里填入任意远程 DSH 地址，壳只当窗口——手机 / Linux / 其他设备通过浏览器或 PWA 也能接入内核，壳本身不绑定本地服务。
- **同一套壳代码，两种分发形态**：安装包版（独立 exe）与插件版（随 `dsh web` 启动）共用 `electron/` 壳代码，仅运行时来源与启动方式不同（见「安装」）。

## 平台矩阵

| 平台 | 壳 | 状态 |
|:--|:--|:--|
| Windows | ✅ Electron（无边框 + 原生窗口按钮） | 已发布（NSIS 安装包） |
| macOS | ✅ Electron（hiddenInset） | 已发布（CI 构建 Intel + Apple Silicon DMG） |
| Linux | —（浏览器 / PWA 直连内核） | 不做 |
| Termux / 手机 / 平板 | —（headless / PWA 直连内核） | 由内核远程访问支持 |

## 开发

```sh
npm install
npm run build   # 构建插件 bundle
npm run dev     # 启动壳（开发模式）
npm run pack    # 打包 NSIS (Win) / DMG (mac)
```

## 更新历史

### 0.1.4
- 分支二（插件市场分发）正式可用：`dsh plugin add` 装插件 → 重启 `dsh web` → 桌面壳自动弹出；Electron 运行时由插件自管理（本地复用 / 按网络环境自动选源下载）。
- 桌面快捷方式：首次启动询问创建 + 托盘「创建桌面快捷方式」一键添加（安装包与插件两种形态均支持）。
- 图标：Windows 任务栏 / macOS Dock 均显示鲸鱼图标（裸运行时场景）。
- 移除开机自启（两种形态统一为纯手动启动）。

### 0.1.2
- Windows 自动更新：托盘「检查更新」改为后台下载 + 进度显示 + 重启安装（electron-updater）；macOS 仍为手动下载。
- 移除启动时自动拉起后端（改纯手动，与「关闭后端」不冲突）。
- 新增贡献者全套文件（CONTRIBUTING / 行为准则 / 安全策略 / Issue 与 PR 模板）。
- README：新增 Windows SmartScreen 安装指引；澄清「插件注册 ≠ 安装桌面应用」。

### 0.1.1
- 后端生命周期：修复 Windows 下启动报 `spawn EINVAL`、卡「启动中」的问题；「关闭后端」现在能真正停掉后端（含外部启动的实例）；启动 / 重启 / 关闭带进度弹窗。
- 窗口可靠性：双击立即出窗；后端关闭窗口立刻切离线黑屏；后端恢复自动重连（Edge 式即时刷新）。
- 离线页自助：重新加载 / 启动后端 / 自动探测后端 / 设置后端安装文件夹。
- 托盘：新增「刷新窗口」；macOS 构建发布（Intel + Apple Silicon DMG）。

### 0.1.0
- 初始版本：Electron 壳骨架，系统托盘/单实例，DSH 插件挂载。

## 贡献

欢迎任何形式的贡献——修 bug、加功能、改进文档都行。请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)（含项目结构、开发约定、提交规范、PR 流程），并遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。安全漏洞请走 [SECURITY.md](SECURITY.md) 的私密报告流程。

## 致谢

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) —— 内核本体。
- 架构参考 [Hermes Agent Desktop](https://github.com/NousResearch/hermes-agent) 的壳/内核分离设计。
