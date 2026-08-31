/**
 * Desktop shortcut management (Windows .lnk via Electron's shell API).
 *
 * Used by:
 *  - first-run prompt in main.js ("create a desktop shortcut?")
 *  - the tray "create desktop shortcut" item (always available)
 *
 * Works in both distribution branches:
 *  - installer (packaged): targets the installed exe, no arguments
 *  - plugin-market (bare runtime): targets the provisioned electron.exe
 *    with the plugin's electron/main.js as its argument
 *
 * Pure dev mode (npm run dev from a checkout) has no stable executable,
 * so the feature stays disabled there.
 *
 * Electron's built-in shortcut API replaced the earlier hand-rolled
 * PowerShell + WScript.Shell COM script: fewer moving parts (no spawned
 * interpreter to hang or quote-escape), and it composes with the
 * Start-menu shortcut path that already used the same API.
 */
import { app, shell } from 'electron'
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP_USER_MODEL_ID } from './aumid.js'

const isWin = process.platform === 'win32'
const SHORTCUT_NAME = 'DSH Clean Desktop Shell.lnk'
const PKG_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const ICON_ICO = join(PKG_ROOT, 'build', 'icon.ico')

/**
 * Plugin-market mode: the host half spawns a bare electron runtime with the
 * plugin's electron/main.js as its entry. process.execPath is the runtime
 * electron.exe; process.argv[1] is the entry script (packaged installers
 * have no such argument).
 */
function pluginArgs() {
  if (app.isPackaged) return []
  const entry = process.argv[1]
  if (entry && /\.js$/i.test(entry)) return [entry]
  return []
}

/** Shortcuts need a stable executable — supported when packaged or in
 *  plugin mode (where the runtime path is fixed under DSH_HOME). */
export function shortcutSupported() {
  return isWin && (app.isPackaged || pluginArgs().length > 0)
}

/**
 * The user's real Desktop. app.getPath('desktop') resolves OneDrive
 * redirection and roaming profile policies — a hardcoded ~/Desktop misses
 * those and writes the shortcut where the user will never see it.
 */
function desktopDir() {
  try {
    return app.getPath('desktop')
  } catch {
    return join(app.getPath('home'), 'Desktop')
  }
}

/** True when a desktop shortcut already points at this app's exe. */
export function hasDesktopShortcut() {
  if (!isWin || !shortcutSupported()) return false
  try {
    const target = process.execPath.toLowerCase()
    for (const entry of readdirSync(desktopDir())) {
      if (!entry.toLowerCase().endsWith('.lnk')) continue
      try {
        // readShortcutLink throws on invalid/non-shortcut files — skip those.
        const link = shell.readShortcutLink(join(desktopDir(), entry))
        if (String(link.target).toLowerCase() === target) return true
      } catch {
        // unreadable .lnk — not ours
      }
    }
  } catch {
    // unreadable desktop — treat as "not present"
  }
  return false
}

/** Create (or overwrite) the desktop shortcut for this app. Returns bool. */
export function createDesktopShortcut() {
  if (!shortcutSupported()) return false
  const args = pluginArgs()
  const ico = existsSync(ICON_ICO) ? ICON_ICO : undefined
  // 'overwrite' makes the call idempotent (safe to re-run after updates).
  return shell.writeShortcutLink(join(desktopDir(), SHORTCUT_NAME), 'overwrite', {
    target: process.execPath,
    args: args.length ? args.join(' ') : undefined,
    icon: ico,
    iconIndex: 0,
    appUserModelId: APP_USER_MODEL_ID,
  })
}

/**
 * Ensure a Start-menu shortcut carrying the AppUserModelID. This is what
 * makes the taskbar button show our icon: Windows matches a running
 * window's AUMID to a shortcut's icon (bare runtime electron.exe has no
 * icon resource of its own). Idempotent — the shortcut is only created
 * when missing.
 */
export function ensureStartMenuShortcut() {
  if (!isWin || !shortcutSupported()) return false
  const lnkDir = join(
    process.env.APPDATA || join(app.getPath('home'), 'AppData', 'Roaming'),
    'Microsoft', 'Windows', 'Start Menu', 'Programs',
  )
  const lnk = join(lnkDir, SHORTCUT_NAME)
  const args = pluginArgs()
  return shell.writeShortcutLink(lnk, 'create', {
    target: process.execPath,
    args: args.length ? args.join(' ') : undefined,
    icon: existsSync(ICON_ICO) ? ICON_ICO : undefined,
    iconIndex: 0,
    appUserModelId: APP_USER_MODEL_ID,
  })
}
