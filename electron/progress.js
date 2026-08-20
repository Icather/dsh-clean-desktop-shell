/**
 * Small always-on-top progress window for backend operations
 * (start / restart / stop). Single instance; reused across calls.
 *
 * States: 'busy' (spinner) | 'ok' | 'error' — the caller decides when to
 * close it (auto-close timers live in the caller).
 */
import { BrowserWindow } from 'electron'
import { fileURLToPath } from 'node:url'

const PRELOAD = fileURLToPath(new URL('./progress-preload.js', import.meta.url))
const PAGE = fileURLToPath(new URL('./progress.html', import.meta.url))

let win = null

/** Show (or update) the progress window. */
export function showProgress({ title, message, state = 'busy' }) {
  if (!win || win.isDestroyed()) {
    win = new BrowserWindow({
      width: 420,
      height: 128,
      frame: false,
      resizable: false,
      movable: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      backgroundColor: '#10131A',
      webPreferences: {
        preload: PRELOAD,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })
    win.loadFile(PAGE)
    win.once('ready-to-show', () => win.show())
    win.on('closed', () => {
      win = null
    })
  }
  setProgress({ title, message, state })
  return win
}

/** Update the currently visible progress window (no-op if hidden). */
export function setProgress({ title, message, state }) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('progress:set', { title, message, state })
  }
}

/** Close the progress window if open. */
export function closeProgress() {
  if (win && !win.isDestroyed()) win.close()
}
