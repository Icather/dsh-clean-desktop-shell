/**
 * System tray: show/hide window, open-at-login toggle, quit.
 */
import { Tray, Menu, nativeImage } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from './config.js'

const trayIconPath = join(
  fileURLToPath(new URL('.', import.meta.url)),
  'assets',
  process.platform === 'win32' ? 'tray-16.png' : 'tray-32.png',
)

let trayInstance = null

export function createTray({ onShow, onToggleAutoStart, onQuit }) {
  const config = loadConfig()
  const icon = nativeImage.createFromPath(trayIconPath)

  trayInstance = new Tray(icon)
  trayInstance.setToolTip('DSH Clean Desktop Shell')

  const menu = Menu.buildFromTemplate([
    { label: '显示 / 打开窗口', click: onShow },
    { type: 'separator' },
    {
      label: '开机自启',
      type: 'checkbox',
      checked: !!config.autoLaunch,
      click: (item) => onToggleAutoStart(item.checked),
    },
    { type: 'separator' },
    { label: '退出', click: onQuit },
  ])
  trayInstance.setContextMenu(menu)
  trayInstance.on('click', onShow)
  return trayInstance
}
