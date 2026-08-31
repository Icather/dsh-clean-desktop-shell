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
import { app, BrowserWindow, dialog, nativeImage } from 'electron'
import { fileURLToPath } from 'node:url'
import { createMainWindow, reloadWindow } from './window.js'
import { createTray, refreshTrayMenu } from './tray.js'
import { loadConfig, saveConfig, DEFAULT_TARGET_URL } from './config.js'
import { detect } from './service.js'
import { setupAutoUpdater } from './update.js'
import { shortcutSupported, hasDesktopShortcut, createDesktopShortcut, ensureStartMenuShortcut } from './shortcut.js'
import { APP_USER_MODEL_ID } from './aumid.js'
import { setupCrashGuard } from './crashGuard.js'

const isMac = process.platform === 'darwin'

// Last-resort error capture (userData/shell-crash.log) — install before
// anything else so even early startup failures leave a trace.
setupCrashGuard()

// Windows: pin the AppUserModelId so the taskbar shows our whale icon
// instead of the generic Electron icon. Plugin mode uses a distinct ID
// (see aumid.js) so Windows re-reads the icon instead of serving a
// stale per-AUMID cached one.
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_USER_MODEL_ID)
}

// macOS: a bare runtime has no .app bundle (no icon resource), so set the
// Dock icon at runtime. Unlike Windows there is no per-AUMID taskbar cache
// here — app.dock.setIcon applies directly. Packaged builds already carry
// the icon in their bundle, so skip those.
if (isMac && !app.isPackaged) {
  try {
    const dockIcon = nativeImage.createFromPath(
      fileURLToPath(new URL('../build/icon.png', import.meta.url)),
    )
    if (!dockIcon.isEmpty()) app.dock.setIcon(dockIcon)
  } catch {
    // non-fatal: keep the default icon
  }
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
    const target = config.targetUrl || DEFAULT_TARGET_URL

    mainWindow = createMainWindow({ target })
    mainWindow.on('closed', () => {
      mainWindow = null
    })
    mainWindow.on('close', (event) => {
      // Close hides to tray unless we are actually quitting. Read the
      // config fresh so a runtime change to closeToTray takes effect.
      if (!app.isQuitting && loadConfig().closeToTray !== false) {
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
    const target = config.targetUrl || DEFAULT_TARGET_URL
    // Remote targets are the user's own business — never probe local.
    // Origin comparison (not string equality) tolerates trailing slashes
    // and an explicitly written default.
    if (new URL(target).origin !== new URL(DEFAULT_TARGET_URL).origin) return
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
          reloadWindow(mainWindow, loadConfig().targetUrl || DEFAULT_TARGET_URL)
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

    // Windows: ensure the AUMID-carrying Start-menu shortcut exists so the
    // taskbar button shows our icon (see shortcut.js). Best-effort.
    try {
      ensureStartMenuShortcut()
    } catch {
      // non-fatal
    }

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
