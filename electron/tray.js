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
import { getStatus, start, stop, restart, detect, findDshInFolder, detectInstallFolder } from './service.js'

const trayIconPath = join(
  fileURLToPath(new URL('.', import.meta.url)),
  'assets',
  process.platform === 'win32' ? 'tray-16.png' : 'tray-32.png',
)

let trayInstance = null
let handlers = null

export function createTray({ onShow, onToggleAutoStart, onQuit }) {
  const icon = nativeImage.createFromPath(trayIconPath)

  handlers = { onShow, onToggleAutoStart, onQuit }

  trayInstance = new Tray(icon)
  trayInstance.setToolTip('DSH Clean Desktop Shell')
  trayInstance.on('click', onShow)

  refreshTrayMenu()
  return trayInstance
}

/** Rebuild the context menu (call after backend state changes). */
export function refreshTrayMenu() {
  if (!trayInstance || !handlers) return
  const { onShow, onToggleAutoStart, onQuit } = handlers
  const config = loadConfig()
  const st = getStatus()
  const label = statusLabel(st)

  const menu = Menu.buildFromTemplate([
    { label: '显示 / 打开窗口', click: onShow },
    { type: 'separator' },
    { label: `后端：${label}`, enabled: false },
    {
      label: '启动后端',
      enabled: st.status !== 'running' && st.status !== 'starting',
      click: async () => {
        try {
          await start({ backendPath: loadConfig().backendPath })
        } catch (err) {
          dialog.showErrorBox('后端启动失败', err.message)
        }
        refreshTrayMenu()
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
        refreshTrayMenu()
      },
    },
    {
      label: '关闭后端',
      enabled: st.status === 'running' || st.status === 'starting',
      click: async () => {
        await stop()
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
      click: async () => {
        // Default location: auto-detect the dsh install folder first.
        const detected = await detectInstallFolder()
        const defaultFolder = detected || config.backendPath || undefined
        const result = await dialog.showOpenDialog({
          title: '选择dsh后端安装文件夹',
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
