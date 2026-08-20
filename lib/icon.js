/**
 * Patch the runtime electron.exe's icon resource so the Windows taskbar
 * shows our whale icon.
 *
 * A bare runtime exe ships Electron's default icon and — as documented —
 * no runtime API (BrowserWindow icon, setAppDetails, AUMID shortcuts) can
 * change the taskbar button: it reads the exe's icon resource. rcedit
 * (electron team's official tool) rewrites it in place.
 *
 * Best-effort: icon patching must never block the shell from launching.
 * Idempotent: a marker file next to the exe records success; a re-provisioned
 * (new version) exe has no marker and gets patched again.
 */
import { spawn } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PKG_ROOT, isWin, runtimeRoot } from './common.js'

export async function patchExeIcon(ctx, exe) {
  if (!isWin) return
  const ico = join(PKG_ROOT, 'build', 'icon.ico')
  if (!existsSync(ico)) return
  const marker = `${exe}.whale-icon`
  if (existsSync(marker)) return

  // rcedit is a single self-contained exe, cached next to the runtimes.
  const rcedit = join(runtimeRoot(), 'rcedit-x64.exe')
  if (!existsSync(rcedit)) {
    const url = 'https://github.com/electron/rcedit/releases/download/v2.0.0/rcedit-x64.exe'
    ctx.logger.info('[clean-desktop-shell] downloading rcedit for icon patching')
    if (!(await fetchFile(url, rcedit))) {
      ctx.logger.warn('[clean-desktop-shell] rcedit download failed — taskbar icon stays default')
      return
    }
  }

  const child = spawn(rcedit, [exe, '--set-icon', ico], {
    windowsHide: true,
    stdio: 'ignore',
  })
  const ok = await new Promise((resolve) => {
    child.on('error', () => resolve(false))
    child.on('exit', (code) => resolve(code === 0))
  })
  if (ok) {
    writeFileSync(marker, String(Date.now()), 'utf8')
    ctx.logger.info('[clean-desktop-shell] taskbar icon patched (rcedit)')
  } else {
    ctx.logger.warn('[clean-desktop-shell] rcedit patch failed — taskbar icon stays default')
  }
}

function fetchFile(url, dest) {
  return new Promise((resolve) => {
    const child = spawn(
      'curl',
      ['-L', '--fail', '--silent', '--show-error', '--retry', '2', '--max-time', '600', '-o', dest, url],
      { windowsHide: true, stdio: 'ignore' },
    )
    child.on('error', () => resolve(false))
    child.on('exit', (code) => resolve(code === 0))
  })
}
