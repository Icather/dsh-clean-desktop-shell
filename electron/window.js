/**
 * Clean window creation — no frosted-glass materials.
 *
 * Pure shell philosophy: the window is a normal native frame with
 * window-controls overlay (Win) / hiddenInset (mac), and nothing else.
 * No Mica, no vibrancy — keep it clean.
 *
 * Window reliability (Edge-style instant refresh):
 *  - the window shows immediately on launch (never waits for the backend);
 *  - while the backend is unreachable the page load fails and we swap in a
 *    local "backend offline" screen;
 *  - a background poll keeps probing the target; as soon as the backend
 *    answers, the real page is loaded automatically;
 *  - the moment the backend goes down (tray stop, external kill, crash) the
 *    window flips back to the offline screen instead of showing a stale page
 *    that suggests the app is still alive.
 */
import { app, BrowserWindow, ipcMain } from 'electron'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { probe, onStatusChange, detect } from './service.js'
import { startBackendWithProgress, chooseBackendFolder } from './tray.js'
import { APP_USER_MODEL_ID } from './aumid.js'

export const WINDOWS_TITLEBAR_HEIGHT = 32

const PKG_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const PRELOAD_PATH = fileURLToPath(new URL('./preload.js', import.meta.url))
// Windows taskbar follows the window icon only when it is an .ico; a png
// covers the title bar / alt-tab but not the taskbar button. In plugin
// mode there is no exe icon resource, so prefer the bundled .ico.
const TASKBAR_ICO = join(PKG_ROOT, 'build', 'icon.ico')
// Black-whale app icon (matches the DSH web favicon).
const ICON_PATH = existsSync(TASKBAR_ICO)
  ? TASKBAR_ICO
  : fileURLToPath(new URL('../build/icon.png', import.meta.url))
// Local fallback page shown while the backend is down. The file URL is
// precomputed so "is the offline page showing?" is an exact comparison,
// not a substring sniff over arbitrary web content.
const ERROR_PAGE = fileURLToPath(new URL('./error.html', import.meta.url))
const ERROR_PAGE_URL = pathToFileURL(ERROR_PAGE).href

// How often we re-probe the backend while the window is in "offline" mode.
const RECONNECT_INTERVAL_MS = 2500
// How often we check the backend is still alive while the page is shown.
const WATCH_INTERVAL_MS = 4000
// ERR_ABORTED — navigation was cancelled, not a real failure. Ignore it.
const ERR_ABORTED = -3

// Per-window state, keyed by webContents id.
const reconnectTimers = new Map()
const watchTimers = new Map()
const windowTargets = new Map()
const statusUnsubs = new Map()

// Manual reload requests come from the tray button and from the offline
// screen's retry button (via preload -> ipcRenderer). Route them to the
// window that sent the message.
ipcMain.on('shell:reload', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win && !win.isDestroyed()) {
    reloadWindow(win, windowTargets.get(win.id))
  }
})

// Offline-screen quick actions: start / detect backend, pick install
// folder. The resulting state changes propagate via onStatusChange
// (window flip + tray refresh), so no extra wiring is needed here.
ipcMain.on('shell:start-backend', () => startBackendWithProgress())
ipcMain.on('shell:detect-backend', () => detect())
ipcMain.on('shell:choose-backend-folder', () => chooseBackendFolder())

// ---------- offline mode ----------

function stopReconnect(win) {
  const timer = reconnectTimers.get(win.id)
  if (timer) {
    clearInterval(timer)
    reconnectTimers.delete(win.id)
  }
}

function startReconnect(win, target) {
  if (reconnectTimers.has(win.id)) return
  const timer = setInterval(async () => {
    if (win.isDestroyed()) {
      stopReconnect(win)
      return
    }
    const up = await probe(target)
    if (up) {
      stopReconnect(win)
      win.webContents.loadURL(target).catch(() => startReconnect(win, target))
    }
  }, RECONNECT_INTERVAL_MS)
  reconnectTimers.set(win.id, timer)
}

// ---------- online mode (backend liveness watch) ----------

function stopWatch(win) {
  const timer = watchTimers.get(win.id)
  if (timer) {
    clearInterval(timer)
    watchTimers.delete(win.id)
  }
}

/** While the real page is shown, watch that the backend stays alive. */
function startWatch(win, target) {
  if (watchTimers.has(win.id)) return
  const timer = setInterval(async () => {
    if (win.isDestroyed()) {
      stopWatch(win)
      return
    }
    const up = await probe(target, 1500)
    if (!up) {
      // Backend vanished — flip to the offline screen immediately so the
      // stale page cannot fool the user into thinking the app is alive.
      showOffline(win)
    }
  }, WATCH_INTERVAL_MS)
  watchTimers.set(win.id, timer)
}

// ---------- state flips ----------

/** Switch to the offline screen and start re-probing. */
function showOffline(win) {
  if (win.isDestroyed()) return
  const target = windowTargets.get(win.id)
  stopWatch(win)
  win.loadFile(ERROR_PAGE).catch(() => {})
  if (target) startReconnect(win, target)
}

/** Load the real backend page and start watching it. */
function showOnline(win) {
  if (win.isDestroyed()) return
  const target = windowTargets.get(win.id)
  if (!target) return
  stopReconnect(win)
  win.webContents.loadURL(target).catch(() => startReconnect(win, target))
}

/** Load the real target URL in a window (used by tray + offline retry). */
export function reloadWindow(win, target) {
  if (!win || win.isDestroyed()) return
  stopReconnect(win)
  win.webContents.loadURL(target).catch(() => startReconnect(win, target))
}

// ---------- window creation ----------

export function createMainWindow({ target }) {
  const platform = process.platform
  const isWin = platform === 'win32'
  const isMac = platform === 'darwin'

  const base = {
    width: 1280,
    height: 800,
    minWidth: 760,
    minHeight: 520,
    // Show immediately — the backend may be starting, the window must not
    // wait for `ready-to-show` (which lags when the page fails to load).
    show: true,
    title: 'DeepSeek Harness',
    backgroundColor: '#10131A',
    icon: isWin ? ICON_PATH : undefined,
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
  // Windows taskbar button: bare runtime electron.exe has no custom icon,
  // so pin the button to our .ico via setAppDetails (appId must match the
  // app-level AppUserModelId set in main.js, else the options are ignored).
  if (process.platform === 'win32' && existsSync(TASKBAR_ICO)) {
    win.setAppDetails({
      appId: APP_USER_MODEL_ID,
      appIconPath: TASKBAR_ICO,
    })
  }
  windowTargets.set(win.id, target)
  win.loadURL(target).catch(() => startReconnect(win, target))

  // Instant flip when the backend state machine changes (tray stop/start).
  const unsub = onStatusChange((st) => {
    if (win.isDestroyed()) return
    const isOffline = win.webContents.getURL().startsWith(ERROR_PAGE_URL)
    if ((st.status === 'stopped' || st.status === 'error') && !isOffline) {
      // Backend went down while a real page is showing — go dark at once.
      showOffline(win)
    } else if (st.status === 'running' && isOffline) {
      // Backend came up while we are on the offline screen — load it.
      showOnline(win)
    }
  })
  statusUnsubs.set(win.id, unsub)

  win.webContents.on('did-fail-load', (_e, code, _desc, url, isMainFrame) => {
    if (!isMainFrame || code === ERR_ABORTED) return
    // Offline screen already showing — just keep re-probing, do not
    // reload the offline page again (avoids a reload loop if it fails).
    if (win.webContents.getURL().startsWith(ERROR_PAGE_URL)) {
      startReconnect(win, target)
      return
    }
    // Backend unreachable: show the offline screen and start re-probing.
    showOffline(win)
  })

  win.webContents.on('did-finish-load', () => {
    const current = win.webContents.getURL()
    if (current.startsWith(target)) {
      // Real backend page reached — stop re-probing and watch it.
      stopReconnect(win)
      startWatch(win, target)
    }
  })

  win.on('closed', () => {
    stopReconnect(win)
    stopWatch(win)
    const unsub = statusUnsubs.get(win.id)
    if (unsub) {
      unsub()
      statusUnsubs.delete(win.id)
    }
    windowTargets.delete(win.id)
  })

  return win
}
