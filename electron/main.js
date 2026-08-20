/**
 * dsh-clean-desktop-shell — Electron main process entry.
 *
 * Shell/core decoupling:
 *  - default target: http://127.0.0.1:3080 (existing web profile, zero migration)
 *  - configurable remote target (settings file)
 *  - local backend auto-start on launch; full manual control from the tray
 *
 * The main window is a pure shell — all backend controls live in the tray.
 */
import { app, BrowserWindow } from 'electron'
import { createMainWindow, reloadWindow } from './window.js'
import { createTray, refreshTrayMenu } from './tray.js'
import { loadConfig, saveConfig } from './config.js'
import { detect, start } from './service.js'

const isMac = process.platform === 'darwin'

// Windows: pin the AppUserModelId so the taskbar shows our whale icon
// instead of the generic Electron icon.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.icather.dsh-clean-desktop-shell')
}

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
    const target = config.targetUrl || 'http://127.0.0.1:3080'

    mainWindow = createMainWindow({ target })
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

  /** Launch-time backend bootstrap: detect, and auto-start when local. */
  async function bootstrapBackend() {
    const config = loadConfig()
    const target = config.targetUrl || 'http://127.0.0.1:3080'
    const isLocalDefault = target === 'http://127.0.0.1:3080'
    if (!isLocalDefault || config.autoStartService === false) return

    const url = await detect()
    if (!url) {
      // Not running — try to start it, but never block window opening.
      try {
        await start({ backendPath: config.backendPath })
      } catch {
        // Backend unavailable; window still opens, tray shows the error.
      }
    }
    // Reflect the post-detect state in the tray menu.
    refreshTrayMenu()
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
      onReload: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          reloadWindow(mainWindow, loadConfig().targetUrl || 'http://127.0.0.1:3080')
        }
      },
      onQuit: () => {
        app.isQuitting = true
        app.quit()
      },
    })

    // Backend bootstrap in background (never delays the window).
    bootstrapBackend().catch(() => {})

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
