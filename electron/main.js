/**
 * dsh-clean-desktop-shell — Electron main process entry.
 *
 * Shell/core decoupling:
 *  - default target: http://127.0.0.1:3080 (existing web profile, zero migration)
 *  - configurable remote target (settings file)
 *  - local service auto-start when the target is unreachable
 *
 * Platform materials:
 *  - win32: Mica (Windows 11)
 *  - darwin: vibrancy sidebar
 */
import { app, BrowserWindow } from 'electron'
import { createMainWindow } from './window.js'
import { createTray } from './tray.js'
import { loadConfig, saveConfig } from './config.js'
import { ensureService } from './service.js'

const isMac = process.platform === 'darwin'

/** Single instance: a second launch just focuses the existing window. */
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  let mainWindow = null
  let tray = null

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  async function createWindow() {
    const config = loadConfig()

    // Local service auto-start: only when the target is the default local URL
    // and nothing is listening there yet.
    const target = config.targetUrl || 'http://127.0.0.1:3080'
    const isLocalDefault = target === 'http://127.0.0.1:3080'
    if (isLocalDefault && config.autoStartService !== false) {
      await ensureService({ port: 3080 })
    }

    mainWindow = createMainWindow({
      target,
      mode: config.windowMode || 'advanced',
    })
    mainWindow.on('closed', () => {
      mainWindow = null
    })
    mainWindow.on('close', (event) => {
      // Close hides to tray unless we are actually quitting.
      if (!app.isQuitting && config.closeToTray !== false) {
        event.preventDefault()
        mainWindow?.hide()
      }
    })

    return mainWindow
  }

  app.whenReady().then(async () => {
    await createWindow()
    tray = createTray({
      onShow: () => {
        if (!mainWindow) return createWindow()
        mainWindow.show()
        mainWindow.focus()
      },
      onToggleAutoStart: (enabled) => {
        const config = loadConfig()
        saveConfig({ ...config, autoLaunch: enabled })
        app.setLoginItemSettings({ openAtLogin: enabled })
      },
      onQuit: () => {
        app.isQuitting = true
        app.quit()
      },
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
      else mainWindow?.show()
    })
  })

  app.on('window-all-closed', () => {
    // Keep the app alive in the tray (like a normal desktop utility).
    if (!isMac && !app.isQuitting) {
      // do not quit — tray keeps running
    }
  })

  app.on('before-quit', () => {
    app.isQuitting = true
  })
}
