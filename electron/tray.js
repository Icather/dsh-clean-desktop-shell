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
import { getStatus, start, stop, restart, detect } from './service.js'

const trayIconPath = join(
  fileURLToPath(new URL('.', import.meta.url)),
  'assets',
  process.platform === 'win32' ? 'tray-16.png' : 'tray-32.png',
)

let trayInstance = null
let menuRefresh = null

export function createTray({ onShow, onToggleAutoStart, onQuit }) {
  const config = loadConfig()
  const icon = nativeImage.createFromPath(trayIconPath)

  trayInstance = new Tray(icon)
  trayInstance.setToolTip('DSH Clean Desktop Shell')
  trayInstance.on('click', onShow)

  refreshMenu({ onShow, onToggleAutoStart, onQuit, config })
  return trayInstance
}

/** Rebuild the context menu (call after backend state changes). */
function refreshMenu({ onShow, onToggleAutoStart, onQuit, config }) {
  const st = getStatus()
  const label = statusLabel(st)

  const menu = Menu.buildFromTemplate([
    { label: '显示 / 打开窗口', click: onShow },
    { type: 'separator' },
    {
      label: `后端：${label}`,
      enabled: false,
    },
    {
      label: '启动后端',
      enabled: st.status !== 'running' && st.status !== 'starting',
      click: async () => {
        try {
          await start({ backendPath: loadConfig().backendPath })
        } catch (err) {
          dialog.showErrorBox('后端启动失败', err.message)
        }
        refreshMenu({ onShow, onToggleAutoStart, onQuit, config: loadConfig() })
      },
    },
    {
      label: '重启后端',
      enabled: st.status === 'running' || st.status === 'starting',
      click: async () => {
        try {
          await restart({ backendPath: loadConfig().backendPath })
        } catch (err) {
          dialog.showErrorBox('后端重启失败', err.message)
        }
        refreshMenu({ onShow, onToggleAutoStart, onQuit, config: loadConfig() })
      },
    },
    {
      label: '关闭后端',
      enabled: st.status === 'running' || st.status === 'starting',
      click: async () => {
        await stop()
        refreshMenu({ onShow, onToggleAutoStart, onQuit, config: loadConfig() })
      },
    },
    { type: 'separator' },
    {
      label: '自动探测后端',
      click: async () => {
        await detect()
        refreshMenu({ onShow, onToggleAutoStart, onQuit, config: loadConfig() })
      },
    },
    {
      label: '设置后端文件夹…',
      click: async () => {
        const result = await dialog.showOpenDialog({
          title: '选择 dsh 后端所在文件夹',
          properties: ['openDirectory'],
          defaultPath: config.backendPath || undefined,
        })
        if (!result.canceled && result.filePaths[0]) {
          saveConfig({ ...loadConfig(), backendPath: result.filePaths[0] })
        }
        refreshMenu({ onShow, onToggleAutoStart, onQuit, config: loadConfig() })
      },
    },
    { type: 'separator' },
    {
      label: '开机自启',
      type: 'checkbox',
      checked: !!loadConfig().autoLaunch,
      click: (item) => onToggleAutoStart(item.checked),
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
