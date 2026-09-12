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
import { PKG_ROOT, isWin, runtimeRoot, fetchFile } from './common.js'

const RCEDIT_NAME = 'rcedit-x64.exe'
const RCEDIT_URL = 'https://github.com/electron/rcedit/releases/download/v2.0.0/rcedit-x64.exe'

/**
 * rcedit is a ~1.3 MB self-contained exe, and its download sits on the launch
 * path (Windows locks a running image, so the patch has to happen before the
 * exe is spawned). fetchFile's default budget — 600 s — is sized for the
 * ~100 MB Electron runtime, not for this: behind a stalled proxy it could keep
 * the window off screen for ten minutes. Cap it well below that; a miss only
 * costs the default icon.
 */
const RCEDIT_TIMEOUT_SEC = 20

let rceditPromise = null

/**
 * Fetch (once) the cached rcedit binary next to the runtimes. Memoised so the
 * host half can start this alongside the Electron runtime download and have
 * the icon step reuse the same fetch instead of serialising behind it.
 *
 * Never rejects: every failure mode just means "no rcedit, default icon".
 */
export function ensureRcedit(ctx) {
  if (!rceditPromise) {
    rceditPromise = (async () => {
      try {
        const rcedit = join(runtimeRoot(), RCEDIT_NAME)
        if (existsSync(rcedit)) return rcedit
        ctx.logger.info('[clean-desktop-shell] downloading rcedit for icon patching')
        if (await fetchFile(RCEDIT_URL, rcedit, RCEDIT_TIMEOUT_SEC)) return rcedit
        ctx.logger.warn('[clean-desktop-shell] rcedit download failed — taskbar icon stays default')
      } catch (err) {
        ctx.logger.warn(`[clean-desktop-shell] rcedit unavailable (${err?.message ?? err}) — taskbar icon stays default`)
      }
      // Not memoised as a failure: a later launch deserves a fresh attempt.
      rceditPromise = null
      return null
    })()
  }
  return rceditPromise
}

export async function patchExeIcon(ctx, exe) {
  if (!isWin) return
  const ico = join(PKG_ROOT, 'build', 'icon.ico')
  if (!existsSync(ico)) return
  const marker = `${exe}.whale-icon`
  if (existsSync(marker)) return

  const rcedit = await ensureRcedit(ctx)
  if (!rcedit) return

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
