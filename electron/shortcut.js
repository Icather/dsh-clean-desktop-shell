/**
 * Desktop shortcut management (Windows .lnk via WScript.Shell).
 *
 * Used by:
 *  - first-run prompt in main.js ("create a desktop shortcut?")
 *  - the tray "create desktop shortcut" item (always available)
 *
 * Only meaningful for packaged apps — in dev mode there is no stable
 * executable to point the shortcut at, so the feature is disabled there.
 */
import { app } from 'electron'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const isWin = process.platform === 'win32'
const SHORTCUT_NAME = 'DSH Clean Desktop Shell.lnk'

/** Shortcuts are a Windows packaged-app feature. */
export function shortcutSupported() {
  return isWin && app.isPackaged
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
  const lnk = join(homedir(), 'Desktop', SHORTCUT_NAME)
  const script =
    `$ws = New-Object -ComObject WScript.Shell; ` +
    `$s = $ws.CreateShortcut(${ps(lnk)}); ` +
    `$s.TargetPath = ${ps(target)}; ` +
    `$s.WorkingDirectory = ${ps(dirname(target))}; ` +
    `$s.IconLocation = ${ps(`${target},0`)}; ` +
    `$s.Save()`
  const out = await runPs(script)
  return out !== null
}
