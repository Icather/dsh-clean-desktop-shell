/**
 * Clean window creation — no frosted-glass materials.
 *
 * Pure shell philosophy: the window is a normal native frame with
 * window-controls overlay (Win) / hiddenInset (mac), and nothing else.
 * No Mica, no vibrancy — keep it clean.
 *
 * Window reliability (non-destructive recovery):
 *  - the window shows immediately on launch (never waits for the backend);
 *  - without a loaded session (boot, or a page load that failed) an
 *    unreachable backend swaps in the local "backend offline" screen, which
 *    re-probes and loads the real page automatically when it answers;
 *  - once a real page is loaded, a failed liveness probe NEVER navigates
 *    away: the page stays up (draft, scroll, selection intact) and an
 *    in-page notice appears with retry/reload actions. The notice clears by
 *    itself once BOTH health signals are clear — the HTTP probe answers AND
 *    the page's own DSH client runtime reports 'connected' (bridged from
 *    src/client/client.js) — so recovery syncs through the app's own
 *    reconnect loop, never an artificial full reload;
 *  - a confirmed backend exit (service status cause 'exit'/'stop': tray
 *    stop, managed child crash) is the one case that still flips a loaded
 *    page to the offline screen — visible recovery instead of a stale
 *    "online" page. Probe-observed states (watch or detect() timeouts,
 *    cause 'probe') are never treated as a process exit.
 */
import { app, BrowserWindow, ipcMain } from 'electron'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { probe, onStatusChange, detect, getStatus } from './service.js'
import { OutageRun } from './outage.js'
import { startBackendWithProgress, chooseBackendFolder } from './tray.js'
import { APP_USER_MODEL_ID } from './aumid.js'

export const WINDOWS_TITLEBAR_HEIGHT = 32

// Compare by origin (scheme + host + port), ignoring path/query. With dsh
// 0.1.2+ the target may carry a one-time launch token (`.../?token=…`); the
// backend exchanges it for a session cookie and 303-redirects to a clean
// `/`, so the window's settled URL no longer contains the token and an exact
// prefix match would wrongly reject a successful load.
function sameOrigin(a, b) {
  try {
    return new URL(a).origin === new URL(b).origin
  } catch {
    return false
  }
}

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

// Top drag-strip geometry. The preload strip is 32px on Windows, 12px on
// macOS (kept BELOW the web UI's own ~16px toolbar padding so no clickable
// control is swallowed). The inset stamped here is deliberately 28px on
// macOS — larger than the strip — so dockable panels (better-sidebar) both
// clear the swallow band and keep clear of the traffic lights. better-sidebar reads this through its documented shell
// contract: `dsh-desktop-titlebar-inset` on the render URL.
function isWin() {
  return process.platform === 'win32'
}

const TITLEBAR_INSET_PX = isWin() ? 32 : 28

/**
 * Stamp the shell contract onto a page URL: declares this shell frameless
 * (advanced), its platform, and the exact top pixels the drag strip
 * reserves. Dockable panels (better-sidebar) move their top chrome below
 * the strip; plain browsers never see these params.
 */
function stampTarget(target) {
  try {
    const url = new URL(target)
    url.searchParams.set('dsh-desktop-mode', 'advanced')
    url.searchParams.set('dsh-desktop-platform', process.platform)
    url.searchParams.set('dsh-desktop-titlebar-inset', String(TITLEBAR_INSET_PX))
    return url.href
  } catch {
    // Not a parseable URL (custom scheme etc.) — load it untouched.
    return target
  }
}

// ERR_ABORTED — navigation was cancelled, not a real failure. Ignore it.
const ERR_ABORTED = -3

// Per-window state, keyed by webContents id.
const reconnectTimers = new Map()
const watchTimers = new Map()
const windowTargets = new Map()
const statusUnsubs = new Map()
// Per-window backend-outage run (see outage.js): consecutive-failure
// escalation for the notice + the navigation token that discards stale
// probe results after a flip/navigation/disposal.
const outageRuns = new Map()
// Single-flight guard: at most one backend probe per window at a time,
// shared by the watch tick, the reconnect tick and manual retries, so two
// overlapping polls can never double-act on the same result.
const pollInFlight = new Map()
// Merged per-window connection state: HTTP liveness outcome (from the
// outage run) + DSH client-runtime reports from the loaded page (client
// half, src/client/client.js). The notice reflects BOTH — an HTTP success
// must never hide a known terminal disconnect of the page's own connection.
//   http: last committed probe payload ({state:'ok'|'degraded',…}) or null
//   client: 'connected'|'connecting'|'disconnected', or null until the
//           page runtime's first report (bridge forward of the initial
//           snapshot covers the disconnect-before-first-probe case)
//   reconnectPending: a shell-requested client reconnect is outstanding
//           (cleared when the runtime reports connecting/connected)
const connStates = new Map()

/** Fresh merged state for a window that (re)loaded a page. */
function resetConn(win) {
  connStates.set(win.id, { http: null, client: null, reconnectPending: false })
}

function connStateOf(win) {
  let st = connStates.get(win.id)
  if (!st) {
    st = { http: null, client: null, reconnectPending: false }
    connStates.set(win.id, st)
  }
  return st
}

/**
 * Recompute what the in-page notice should show from the merged state and
 * push it to the renderer. The notice is visible whenever the page's own
 * connection is known bad (client 'connecting'/'disconnected') OR the last
 * HTTP probe failed; it hides only when both are clear. The persistent copy
 * (stronger copy + reload action) is offered for anything terminal — a
 * long HTTP outage OR the client runtime sitting in 'disconnected' — but
 * not for 'connecting', where an automatic retry attempt is already in
 * progress and must not be interrupted or escalated.
 */
function refreshNotice(win) {
  if (win.isDestroyed()) return
  const st = connStateOf(win)
  const httpOk = !st.http || st.http.state === 'ok'
  const clientBad = st.client === 'connecting' || st.client === 'disconnected'
  let payload
  if (!clientBad && httpOk) {
    payload = { state: 'ok' }
  } else {
    payload = {
      state: 'degraded',
      persistent:
        st.client === 'disconnected'
        || !!(st.http && st.http.state !== 'ok' && st.http.persistent),
    }
  }
  win.webContents.send('shell:connection-state', payload)
}

/**
 * Ask the loaded page's DSH client runtime to reconnect through its own
 * reconnect loop (shell:client-reconnect → preload → client.js →
 * ctx.connection.reconnect()). Never sent while the runtime already
 * reports 'connecting' (an attempt is in progress) and never repeated per
 * watch tick while an earlier request is still outstanding.
 */
function requestClientReconnect(win) {
  const st = connStateOf(win)
  if (st.reconnectPending || st.client === 'connecting') return
  st.reconnectPending = true
  win.webContents.send('shell:client-reconnect')
}
// Pending launch URL for this window. It exists only until DSH exchanges the
// ?token= for the HttpOnly cookie and 303s back to clean "/", then it is
// cleared so normal reloads/reconnects use the bare canonical target.
const windowLaunchUrls = new Map()
// One-shot re-stamp guard per window: after the token exchange DSH redirects
// to clean "/", dropping the shell contract params, so the stamped target is
// loaded once more.
const restampedWindows = new Set()

/** The URL this window should load right now (launch bootstrap first, then clean target). */
function urlToLoad(win) {
  const pending = windowLaunchUrls.get(win.id)
  if (pending) return pending
  const target = windowTargets.get(win.id)
  return target ? stampTarget(target) : target
}

/** Mark a launch bootstrap as consumed once we land on a clean target URL. */
function clearLaunchUrl(win) {
  if (windowLaunchUrls.has(win.id)) windowLaunchUrls.set(win.id, null)
}

/** The outage run of this window (created lazily on first use). */
function runFor(win) {
  let run = outageRuns.get(win.id)
  if (!run) {
    run = new OutageRun()
    outageRuns.set(win.id, run)
  }
  return run
}

/**
 * The window is about to navigate (flip, reload, reconnect success):
 * invalidate every in-flight probe of this window and start fresh outage +
 * merged-connection state, so stale results can never act on the newer
 * navigation.
 */
function bumpNav(win) {
  runFor(win).reset()
  resetConn(win)
}

// Manual reload requests come from the tray button and from the offline
// screen's retry button (via preload -> ipcRenderer). Route them to the
// window that sent the message.
ipcMain.on('shell:reload', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win && !win.isDestroyed()) {
    reloadWindow(win, windowTargets.get(win.id))
  }
})

// Manual retries share the same probe and reconnect guards as the watch.
// A reachable backend may need a fresh client generation even if the page
// has not yet reported its old connection as disconnected.
ipcMain.on('shell:retry-connection', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win && !win.isDestroyed()) {
    const target = windowTargets.get(win.id)
    checkBackend(win, target, true)
  }
})

// The loaded page's DSH client runtime reports its own connection lifecycle
// (client.js → shellAPI.connectionReport). Terminal disconnect of the page
// connection is invisible to HTTP probes — merge it into the notice state.
ipcMain.on('shell:client-connection', (event, state) => {
  if (state !== 'connected' && state !== 'connecting' && state !== 'disconnected') return
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || win.isDestroyed()) return
  // Only reports from the loaded real page count; the offline screen has no
  // client runtime and stale frames after navigation must not act.
  const target = windowTargets.get(win.id)
  if (!target || !win.webContents.getURL().startsWith(target)) return
  const st = connStateOf(win)
  st.client = state
  // A request is outstanding only while the runtime stays 'disconnected':
  // 'connecting' means an attempt is in progress, 'connected' means done.
  if (state !== 'disconnected') st.reconnectPending = false
  refreshNotice(win)
  // Automatic retries are paced by checkBackend, not by failure feedback.
})

// Offline-screen quick actions: start / detect backend, pick install
// folder. The resulting state changes propagate via onStatusChange
// (window flip + tray refresh), so no extra wiring is needed here.
ipcMain.on('shell:start-backend', () => startBackendWithProgress())
ipcMain.on('shell:detect-backend', () => detect())
ipcMain.on('shell:choose-backend-folder', () => chooseBackendFolder())

// ---------- backend probing (shared by reconnect + watch + manual retry) ----------

/**
 * Run one guarded backend probe for this window.
 *
 * `commit` true (liveness watch / manual retry): the result advances the
 * window's outage run and returns the renderer notice payload
 * ({state:'ok'} / {state:'degraded', persistent}) — or null when skipped
 * (another poll already in flight) or stale (run reset because the window
 * navigated or was disposed while the probe was in flight).
 *
 * `commit` false (offline reconnect): returns the bare probe result
 * (true/false) or null for the same skip/stale cases, without touching the
 * outage run.
 *
 * Timeout stays at 1500ms — the same value as the service.js probe default.
 */
async function guardedProbe(win, target, commit = false) {
  if (win.isDestroyed() || pollInFlight.get(win.id)) return null
  const run = runFor(win)
  const token = run.checkpoint()
  pollInFlight.set(win.id, true)
  let up = false
  try {
    up = await probe(target, 1500)
  } finally {
    pollInFlight.delete(win.id)
  }
  if (win.isDestroyed()) return null
  return commit ? run.apply(token, up) : run.isCurrent(token) ? up : null
}

/**
 * Probe the backend while the real page is shown and record the outcome
 * into the merged per-window connection state (refreshNotice then decides
 * the notice — HTTP and client-runtime signals combined). Never navigates:
 * a failed probe keeps the loaded page (draft, scroll, selection) and only
 * escalates the notice copy after consecutive failures (OutageRun). The
 * offline screen is reached exclusively via confirmed lifecycle exits
 * (service status cause 'exit'/'stop') or boot without a loaded page.
 */
async function checkBackend(win, target, forceReconnect = false) {
  if (win.isDestroyed() || !target) return
  const outcome = await guardedProbe(win, target, true)
  if (!outcome) return
  // Only the loaded real page carries the notice overlay; the offline screen
  // has its own copy and mid-navigation pages must not get a stray message.
  if (!win.webContents.getURL().startsWith(target)) {
    // Page left the target (navigation in progress / other origin) — when it
    // comes back, outage + connection state start fresh.
    bumpNav(win)
    return
  }
  const st = connStateOf(win)
  st.http = outcome
  refreshNotice(win)
  // Retry only after a fresh successful probe. An immediately failing
  // client generation must not feed back into another immediate attempt.
  if (outcome.state === 'ok' && (forceReconnect || st.client === 'disconnected')) {
    requestClientReconnect(win)
  }
}

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
    // While the shell itself is starting the backend, the status machine
    // owns the flip: the port can answer (4xx) before the CLI prints its
    // launch-URL ready line, and probing early would load the bare target
    // and lose the ?token= bootstrap. Wait for service.start() to deliver
    // running + launchUrl instead.
    if ((await getStatus()).status === 'starting') return
    const up = await guardedProbe(win, target)
    if (up === null) return
    if (up) {
      stopReconnect(win)
      // Navigating away from the offline screen — invalidate any probe that
      // started before this moment so it cannot race the navigation.
      bumpNav(win)
      win.webContents.loadURL(urlToLoad(win)).catch(() => startReconnect(win, target))
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
  const timer = setInterval(() => {
    if (win.isDestroyed()) {
      stopWatch(win)
      return
    }
    checkBackend(win, target)
  }, WATCH_INTERVAL_MS)
  watchTimers.set(win.id, timer)
}

// ---------- state flips ----------

/** Switch to the offline screen and start re-probing. */
function showOffline(win) {
  if (win.isDestroyed()) return
  const target = windowTargets.get(win.id)
  stopWatch(win)
  bumpNav(win)
  win.loadFile(ERROR_PAGE).catch(() => {})
  if (target) startReconnect(win, target)
}

/** Load the real backend page and start watching it. */
function showOnline(win) {
  if (win.isDestroyed()) return
  const target = windowTargets.get(win.id)
  if (!target) return
  stopReconnect(win)
  bumpNav(win)
  win.webContents.loadURL(urlToLoad(win)).catch(() => startReconnect(win, target))
}

/** Load the real target URL in a window (used by tray + offline retry). */
export function reloadWindow(win, target) {
  if (!win || win.isDestroyed()) return
  stopReconnect(win)
  bumpNav(win)
  win.webContents.loadURL(urlToLoad(win)).catch(() => startReconnect(win, target))
}

// ---------- window creation ----------

export function createMainWindow({ target, launchUrl }) {
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
  windowLaunchUrls.set(win.id, launchUrl || null)
  win.loadURL(urlToLoad(win)).catch(() => startReconnect(win, target))

  // Instant flip when the backend state machine changes (tray stop/start).
  const unsub = onStatusChange((st) => {
    if (win.isDestroyed()) return
    const isOffline = win.webContents.getURL().startsWith(ERROR_PAGE_URL)
    // Confirmed lifecycle exit only: the status machine witnessed the
    // backend leave — the managed child really exited (cause 'exit',
    // whether it died while running → 'stopped' or while starting →
    // 'error') or an explicit tray stop actually terminated it (cause
    // 'stop' → 'stopped'). Probe-derived states (detect() timeouts →
    // cause 'probe') and start failures are observations, not exits — they
    // must never navigate a loaded page away; the liveness watch reports
    // them through the in-page notice.
    const confirmedExit =
      (st.status === 'stopped' || st.status === 'error')
      && (st.cause === 'exit' || st.cause === 'stop')
    if (confirmedExit) {
      // The old process token died with the backend. Drop it so a later
      // reconnect cannot replay a stale launch URL.
      windowLaunchUrls.set(win.id, null)
      if (!isOffline) showOffline(win)
    } else if (st.status === 'running') {
      // A freshly started dsh web brings a fresh per-process launch URL —
      // printed on its banner, or handed over by the DSH host half in plugin
      // mode. Adopt it so the window re-bootstraps when the previous HttpOnly
      // cookie is gone or the previous process token is stale.
      const fresh = st.launchUrl || null
      const changed = fresh !== null && fresh !== windowLaunchUrls.get(win.id)
      if (fresh !== null) {
        windowLaunchUrls.set(win.id, fresh)
        // A fresh bootstrap means a fresh 303, which will strip the shell
        // contract params again — allow one more re-stamp for this window.
        if (changed) restampedWindows.delete(win.id)
      }
      if (isOffline) {
        // Backend came up while we are on the offline screen — load it.
        showOnline(win)
      } else if (changed) {
        // The backend was replaced without the window ever going offline.
        reloadWindow(win, target)
      }
    }
  })
  statusUnsubs.set(win.id, unsub)

  win.webContents.on('did-fail-load', (_e, code, _desc, url, isMainFrame) => {
    if (!isMainFrame || code === ERR_ABORTED) return
    // Offline screen already showing — just keep re-probing, do not
    // reload the offline page again (avoids a reload loop if it fails).
    if (win.webContents.getURL().startsWith(ERROR_PAGE_URL)) {
      startReconnect(win, windowTargets.get(win.id) || target)
      return
    }
    // The navigation itself failed, so no loaded session is on screen
    // (a user reload or initial boot reached a dead backend). The offline
    // screen is the honest fallback here — unlike a liveness-probe timeout,
    // this is not navigating away from a live page.
    showOffline(win)
  })

  win.webContents.on('did-finish-load', () => {
    const current = win.webContents.getURL()
    const active = windowTargets.get(win.id) || target
    // Compare by origin (scheme + host + port), ignoring path/query: the launch
    // token in the target is dropped by the 303 redirect, so a plain prefix
    // match would reject a load that actually succeeded and authenticated.
    if (sameOrigin(current, active)) {
      // Once DSH redirects the launch URL back to clean "/", the token has done
      // its job. Future loads use the canonical target instead of replaying a
      // one-time credential.
      if (windowLaunchUrls.get(win.id)) {
        let clean = false
        try {
          clean = !new URL(current).searchParams.has('token')
        } catch {
          clean = !current.includes('?token=')
        }
        if (clean) clearLaunchUrl(win)
      }
      // Real backend page reached — stop re-probing, start a fresh outage
      // run + merged connection state and watch it.
      stopReconnect(win)
      runFor(win).reset()
      resetConn(win)
      startWatch(win, active)
      // The token exchange 303s to clean "/", which drops the shell contract
      // params. Re-load the stamped target once so panels relying on the
      // contract (better-sidebar titlebar inset) see it from the start.
      if (!current.includes('dsh-desktop-mode=') && !restampedWindows.has(win.id)) {
        restampedWindows.add(win.id)
        win.webContents.loadURL(stampTarget(target)).catch(() => {})
      }
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
    windowLaunchUrls.delete(win.id)
    restampedWindows.delete(win.id)
    outageRuns.delete(win.id)
    pollInFlight.delete(win.id)
    connStates.delete(win.id)
  })

  return win
}
