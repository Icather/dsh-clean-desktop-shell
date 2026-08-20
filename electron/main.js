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
import { app, BrowserWindow, dialog } from 'electron'
import { createMainWindow, reloadWindow } from './window.js'
import { createTray, refreshTrayMenu } from './tray.js'
import { loadConfig, saveConfig } from './config.js'
import { detect } from './service.js'
import { setupAutoUpdater } from './update.js'
import { shortcutSupported, hasDesktopShortcut, createDesktopShortcut } from './shortcut.js'

const isMac = process.platform === 'darwin'

// Windows: pin the AppUserModelId so the taskbar shows our whale icon
// instead of the generic Electron icon.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.icather.dsh-clean-desktop-shell')
}

// Uniform userData across both distribution branches (installer vs
// plugin-market), so config (target URL, backend path, ...) is shared
// no matter how the shell was launched.
app.setName('DSH Clean Desktop Shell')

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

  /**
   * Launch-time backend detection. Detects whether a local dsh web is
   * already running so the tray and window reflect the real state, but
   * never auto-starts it — starting is a manual action (tray menu or the
   * offline screen button) so it cannot fight an explicit "stop".
   */
  async function bootstrapBackend() {
    const config = loadConfig()
    const target = config.targetUrl || 'http://127.0.0.1:3080'
    // Remote targets are the user's own business — never probe local.
    if (target !== 'http://127.0.0.1:3080') return
    await detect()
    // Reflect the post-detect state in the tray menu.
    refreshTrayMenu()
  }

  /**
   * First-run desktop shortcut prompt (Windows packaged apps only).
   * Asks once; the tray "create desktop shortcut" item stays available
   * forever, so saying no is never a dead end.
   */
  async function ensureShortcut() {
    if (!shortcutSupported() || loadConfig().shortcutAsked) return
    saveConfig({ ...loadConfig(), shortcutAsked: true })
    if (await hasDesktopShortcut()) return
    const choice = dialog.showMessageBoxSync({
      type: 'question',
      title: '创建桌面快捷方式？',
      message: '是否在桌面创建「DSH Clean Desktop Shell」快捷方式？',
      detail: '选择「跳过」也不影响使用——之后可随时在托盘右键菜单中一键添加。',
      buttons: ['创建', '跳过'],
      defaultId: 0,
      cancelId: 1,
    })
    if (choice === 0) {
      const ok = await createDesktopShortcut()
      if (!ok) {
        dialog.showErrorBox('创建快捷方式失败', '无法在桌面创建快捷方式。可稍后在托盘右键菜单中重试。')
      }
    }
  }

  app.whenReady().then(async () => {
    await createWindow()
    tray = createTray({
      onShow: () => {
        if (!mainWindow) return createWindow()
        mainWindow.show()
        mainWindow.focus()
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

    // Windows: wire the auto-updater (downloads new installers silently).
    setupAutoUpdater()

    // First run: offer a desktop shortcut (never nags twice).
    ensureShortcut().catch(() => {})

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
