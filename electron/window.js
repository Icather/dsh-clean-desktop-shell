/**
 * Clean window creation — no frosted-glass materials.
 *
 * Pure shell philosophy: the window is a normal native frame with
 * window-controls overlay (Win) / hiddenInset (mac), and nothing else.
 * No Mica, no vibrancy — keep it clean.
 */
import { BrowserWindow } from 'electron'
import { fileURLToPath } from 'node:url'

export const WINDOWS_TITLEBAR_HEIGHT = 32

const PRELOAD_PATH = fileURLToPath(new URL('./preload.js', import.meta.url))

export function createMainWindow({ target }) {
  const platform = process.platform
  const isWin = platform === 'win32'
  const isMac = platform === 'darwin'

  const base = {
    width: 1280,
    height: 800,
    minWidth: 760,
    minHeight: 520,
    show: false,
    title: 'DeepSeek Harness',
    backgroundColor: '#10131A',
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  }

  let options = { ...base }

  if (isMac) {
    options = {
      ...base,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 16 },
    }
  } else if (isWin) {
    options = {
      ...base,
      autoHideMenuBar: true,
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#00000000',
        symbolColor: '#7f858f',
        height: WINDOWS_TITLEBAR_HEIGHT,
      },
    }
  }
  // Linux / other: keep the native frame.

  const win = new BrowserWindow(options)
  win.loadURL(target)

  win.once('ready-to-show', () => win.show())

  return win
}
