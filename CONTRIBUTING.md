# 参与贡献（Contributing）

感谢你对 `dsh-clean-desktop-shell` 感兴趣！这是一个小项目，但任何形式的贡献都受欢迎：修 bug、加功能、改进文档、提 issue 都行。

## 项目结构

```
desktop-shell/
├── electron/            # 桌面壳主进程代码（核心）
│   ├── main.js          # 入口：单实例、托盘、后端 bootstrap、自动更新初始化
│   ├── window.js        # 窗口创建 + 离线/在线状态机（Edge 式即时刷新）
│   ├── service.js       # 后端生命周期：detect/start/stop/restart + 状态通知
│   ├── tray.js          # 托盘菜单 + 共享后端操作（进度弹窗、选文件夹）
│   ├── config.js        # 配置持久化（userData/config.json）
│   ├── preload.js       # 拖拽条 + shellAPI（contextBridge）
│   ├── update.js        # Win 自动更新 / mac 手动下载
│   ├── progress.js      # 后端操作进度小窗
│   ├── error.html       # 「后端未连接」离线页
│   └── ...
├── src/                 # DSH 插件挂载骨架（host + client）
├── lib/                 # 构建产物（scripts/build.mjs 生成，必须提交——git 安装依赖它）
├── scripts/             # 构建/图标生成脚本
├── cordis.patch.yml     # DSH 插件注册（bundle patch）
└── package.json         # 插件元数据 + electron-builder 配置
```

## 环境准备

```sh
npm install        # 安装依赖
npm run dev        # 启动壳（开发模式，连本地 dsh web 3080）
npm run build      # 构建插件 bundle（src → lib）
npm run pack       # 打包 NSIS 安装包（Win）
npm run pack:mac   # 打包 DMG（mac）
```

> 国内网络：npm 镜像用 npmmirror（项目 `.npmrc` 已配置）；GitHub 访问建议通过本地代理（如 Clash `127.0.0.1:7897`），但不要修改系统代理。

## 开发约定

- **代码注释用英文**；面向用户的文案（弹窗、菜单）用中文。
- 模块用 ESM（项目 `"type": "module"`）。
- **不要硬编码**：路径、端口、URL 等尽可能走配置/常量。
- 后端状态变化通过 `service.onStatusChange()` 广播——窗口翻转、托盘刷新都靠它，不要各自轮询。
- 新增托盘/离线页操作时，优先复用 `tray.js` 里已提取的共享函数（如 `startBackendWithProgress`）。

## 提交规范

- **原子化提交**：一个 commit 只做一件事（一个 fix / 一个 feature），便于回滚和 review。
- 提交信息风格（参考 [Conventional Commits](https://www.conventionalcommits.org/)）：

```
type: 一句话摘要

- 具体说明（可选，bullet 列表）
```

  `type` 用 `fix` / `feat` / `docs` / `chore` / `build` / `ci` 等。摘要用英文（项目历史惯例），说明可以中英混合。

- 提交前先 `node --check` 相关文件，确认无语法错误。

## 提 PR 流程

1. Fork 本仓库，`git checkout -b fix/xxx` 开分支。
2. 提交改动（遵守上面的提交规范）。
3. 推送分支，发起 PR。PR 描述参考 `.github/PULL_REQUEST_TEMPLATE.md`。
4. 描述里尽量说明：改了什么、为什么、怎么测试。

## 报告问题（Issue）

- Bug 请用 `.github/ISSUE_TEMPLATE/bug_report.yml` 模板，尽量附上复现步骤和截图/日志。
- 功能建议用 `feature_request.yml`。
- 安全漏洞请走 [SECURITY.md](SECURITY.md) 的私密披露流程，不要公开贴。

## 行为准则

参与本项目即表示同意遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。
