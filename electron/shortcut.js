/**
 * Desktop shortcut management (Windows .lnk via WScript.Shell).
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
 */
import { app, shell } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
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

function ps(str) {
  return "'" + String(str).replace(/'/g, "''") + "'"
}

function runPs(script) {
  return new Promise((resolve) => {
    const p = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
    })
    let out = ''
    p.stdout.on('data', (d) => {
      out += d.toString()
    })
    p.on('error', () => resolve(null))
    p.on('exit', () => resolve(out))
  })
}

/** True when a desktop shortcut already points at this app's exe. */
export async function hasDesktopShortcut() {
  if (!isWin) return false
  const script =
    `$ws = New-Object -ComObject WScript.Shell; ` +
    `Get-ChildItem ${ps(join(homedir(), 'Desktop', '*.lnk'))} | ` +
    `ForEach-Object { $ws.CreateShortcut($_.FullName).TargetPath }`
  const out = await runPs(script)
  if (out === null) return false
  const target = process.execPath.toLowerCase()
  return out
    .split(/\r?\n/)
    .map((s) => s.trim().toLowerCase())
    .some((line) => line === target)
}

/** Create (or overwrite) the desktop shortcut for this app. Returns bool. */
export async function createDesktopShortcut() {
  if (!shortcutSupported()) return false
  const target = process.execPath
  const args = pluginArgs()
  const lnk = join(homedir(), 'Desktop', SHORTCUT_NAME)
  // Plugin mode: point the shortcut at the runtime exe + main.js argument.
  // WScript needs the path double-quoted inside the Arguments string.
  const argPart = args.length
    ? `; $s.Arguments = ${ps(`"${args[0]}"`)}; `
    : ''
  // Plugin-mode exe has no custom icon resource — point the shortcut at the
  // bundled .ico when present (packaged installers use the exe itself).
  const iconLoc = existsSync(ICON_ICO) ? ICON_ICO : `${target},0`
  const script =
    `$ws = New-Object -ComObject WScript.Shell; ` +
    `$s = $ws.CreateShortcut(${ps(lnk)}); ` +
    `$s.TargetPath = ${ps(target)}; ` +
    argPart +
    `$s.WorkingDirectory = ${ps(dirname(target))}; ` +
    `$s.IconLocation = ${ps(iconLoc)}; ` +
    `$s.Save()`
  const out = await runPs(script)
  return out !== null
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
    process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'),
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
