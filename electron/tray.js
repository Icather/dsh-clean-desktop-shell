/**
 * System tray: window show/hide, backend management, auto-launch, quit.
 *
 * All backend controls live here (tray only) — the main window stays a
 * pure shell with no backend chrome.
 */
import { Tray, Menu, dialog, nativeImage } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig, saveConfig } from './config.js'
import {
  getStatus,
  start,
  stop,
  restart,
  detect,
  findDshInFolder,
  detectInstallFolder,
  onStatusChange,
} from './service.js'
import { showProgress, setProgress, closeProgress } from './progress.js'
import { checkForUpdatesAuto, openRepo } from './update.js'
import { shortcutSupported, createDesktopShortcut } from './shortcut.js'

const trayIconPath = join(
  fileURLToPath(new URL('.', import.meta.url)),
  'assets',
  process.platform === 'win32' ? 'tray-16.png' : 'trayTemplate.png',
)
// macOS: the filename must end in "Template" (e.g. trayTemplate.png) and
// Electron will automatically pick trayTemplate@2x.png on Retina.
// The image itself must be a black silhouette + alpha channel so it
// inverts correctly in both light and dark menu bars.

let trayInstance = null
let handlers = null

export function createTray({ onShow, onReload, onQuit }) {
  const icon = nativeImage.createFromPath(trayIconPath)

  handlers = { onShow, onReload, onQuit }

  trayInstance = new Tray(icon)
  trayInstance.setToolTip('DSH Clean Desktop Shell')
  trayInstance.on('click', onShow)

  // Keep the menu in sync whenever the backend state machine changes
  // (starting → running / error / stopped happens asynchronously).
  onStatusChange(() => refreshTrayMenu())

  refreshTrayMenu()
  return trayInstance
}

/** Rebuild the context menu (call after backend state changes). */
export function refreshTrayMenu() {
  if (!trayInstance || !handlers) return
  const { onShow, onReload, onQuit } = handlers
  const st = getStatus()
  const label = statusLabel(st)

  const menu = Menu.buildFromTemplate([
    { label: '显示 / 打开窗口', click: onShow },
    {
      label: '刷新窗口',
      click: onReload,
    },
    // Windows-only: desktop .lnk shortcut. Hidden on other platforms instead of
    // disabled so the menu stays relevant to the OS it is running on.
    {
      label: '创建桌面快捷方式',
      visible: shortcutSupported(),
      click: async () => {
        const ok = await createDesktopShortcut()
        if (ok) {
          dialog.showMessageBoxSync({
            type: 'info',
            title: '已创建',
            message: '桌面快捷方式已创建。',
          })
        } else {
          dialog.showMessageBoxSync({
            type: 'warning',
            title: '创建失败',
            message: '无法创建桌面快捷方式，请稍后重试。',
          })
        }
      },
    },
    { type: 'separator' },
    { label: `后端：${label}`, enabled: false },
    {
      label: '启动后端',
      enabled: st.status !== 'running' && st.status !== 'starting',
      click: () => startBackendWithProgress(),
    },
    {
      label: '重启后端',
      enabled: st.status === 'running' || st.status === 'starting',
      click: async () => {
        showProgress({ title: '重启后端', message: '正在重启 dsh 后端…' })
        try {
          await restart({ backendPath: loadConfig().backendPath })
          setProgress({ title: '重启后端', message: '后端已重启', state: 'ok' })
          setTimeout(closeProgress, 1200)
        } catch (err) {
          closeProgress()
          dialog.showErrorBox('后端重启失败', err.message)
        }
        refreshTrayMenu()
      },
    },
    {
      label: '关闭后端',
      enabled: st.status === 'running' || st.status === 'starting',
      click: async () => {
        showProgress({ title: '关闭后端', message: '正在关闭 dsh 后端…' })
        try {
          await stop()
          setProgress({ title: '关闭后端', message: '后端已关闭', state: 'ok' })
          setTimeout(closeProgress, 1200)
        } catch (err) {
          closeProgress()
          dialog.showErrorBox('后端关闭失败', err.message)
        }
        refreshTrayMenu()
      },
    },
    { type: 'separator' },
    {
      label: '自动探测后端',
      click: async () => {
        await detect()
        refreshTrayMenu()
      },
    },
    {
      label: '设置后端安装文件夹…',
      click: () => chooseBackendFolder(),
    },
    { type: 'separator' },
    {
      label: '检查更新…',
      click: async () => {
        // checkForUpdatesAuto() handles all three modes internally:
        //   Windows packaged → electron-updater auto-download
        //   Plugin mode      → npm registry check + one-click update
        //   macOS packaged   → GitHub Releases manual link
        await checkForUpdatesAuto()
      },
    },
    {
      label: '仓库主页',
      click: () => openRepo(),
    },
    { type: 'separator' },
    { label: '退出', click: onQuit },
  ])
  trayInstance.setContextMenu(menu)
}

function statusLabel(st) {
  switch (st.status) {
    case 'running':
      return `运行中 (PID ${st.pid ?? '外部'})`
    case 'starting':
      return '启动中…'
    case 'error':
      return `错误：${st.error || '未知'}`
    default:
      return '未运行'
  }
}

/**
 * Start the backend with a progress window. Shared by the tray menu and
 * the offline screen buttons. Returns true on success.
 */
export async function startBackendWithProgress() {
  showProgress({ title: '启动后端', message: '正在启动 dsh 后端…' })
  try {
    await start({ backendPath: loadConfig().backendPath })
    setProgress({ title: '启动后端', message: '后端已启动', state: 'ok' })
    setTimeout(closeProgress, 1200)
    return true
  } catch (err) {
    closeProgress()
    dialog.showErrorBox('后端启动失败', err.message)
    return false
  } finally {
    refreshTrayMenu()
  }
}

/**
 * Pick the dsh install folder via a native dialog (auto-detect default).
 * Shared by the tray menu and the offline screen. Saves the choice to
 * config and validates that a dsh executable exists inside.
 */
export async function chooseBackendFolder() {
  const config = loadConfig()
  const detected = await detectInstallFolder()
  const defaultFolder = detected || config.backendPath || undefined
  const result = await dialog.showOpenDialog({
    title: '选择dsh后端安装文件夹，默认安装用自动探测',
    buttonLabel: '选择此文件夹',
    message: '默认安装用自动探测。可手动指定 dsh 后端安装文件夹（包含 dsh 可执行文件）。',
    properties: ['openDirectory'],
    defaultPath: defaultFolder,
  })
  if (!result.canceled && result.filePaths[0]) {
    const folder = result.filePaths[0]
    saveConfig({ ...loadConfig(), backendPath: folder })
    const found = await findDshInFolder(folder)
    if (found) {
      dialog.showMessageBox({
        type: 'info',
        title: '后端安装文件夹已设置',
        message: `已找到 dsh：\n${found}`,
      })
    } else {
      dialog.showMessageBox({
        type: 'warning',
        title: '未在此文件夹找到 dsh',
        message:
          '此文件夹内未找到 dsh 可执行文件。已保存该路径，但启动后端时可能失败——\n' +
          '请确认选择的是包含 dsh（dsh.cmd / bin/dsh.cmd / node_modules/.bin/dsh.cmd）的文件夹。',
      })
    }
  }
  refreshTrayMenu()
}
