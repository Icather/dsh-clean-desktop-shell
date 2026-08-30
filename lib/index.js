/**
 * dsh-clean-desktop-shell — host half (plugin loader entry).
 *
 * Branch 2 (plugin-market distribution): when installed through the DSH
 * plugin market, this host half brings up the Electron shell itself.
 *
 * The shell code is shared with branch 1 (installer) — only the runtime
 * provisioning and launch differ. See runtime.js (provisioning) and
 * icon.js (Windows taskbar icon).
 */
import { spawn } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { PKG_ROOT, MAIN_JS, dshHome, runtimeRoot, launchLogPath } from './common.js'
import { ensureRuntime } from './runtime.js'
import { patchExeIcon } from './icon.js'

// cordis registers the plugin by this name — bundles without an explicit
// `name` export are silently skipped by the dsh loader.
export const name = 'dsh-clean-desktop-shell'

// Disable auto-launch with DSH_SHELL_AUTO_LAUNCH=0.
const AUTO_LAUNCH = process.env.DSH_SHELL_AUTO_LAUNCH !== '0'

let launched = false

export function apply(ctx) {
  ctx.logger.info('[clean-desktop-shell] mounted (host half)')
  if (!AUTO_LAUNCH) return
  // The dsh bundle loader calls apply() during early boot, but the cordis
  // 'ready' event never fires for bundle plugins (dshmarket / agent-teams
  // use ctx.inject or run inline instead). Launch directly: the shell is a
  // separate process with its own offline screen + auto-reconnect, so an
  // early launch is safe — it shows the offline page until 3080 answers.
  ;(async () => {
    try {
      const exe = await ensureRuntime(ctx)
      await patchExeIcon(ctx, exe).catch(() => {})
      launchShell(exe, ctx)
    } catch (err) {
      reportLaunchFailure(ctx, err)
    }
  })()
}

/**
 * A provisioning failure used to vanish into ctx.logger — invisible to
 * anyone who is not already tailing the DSH log. That is precisely how the
 * macOS launch bug survived several releases: there was no window, no error
 * dialog, and nothing on disk to send back.
 *
 * Write a diagnostics file next to the runtime and name it in the warning,
 * so a user on an untested platform can hand us something actionable.
 */
function reportLaunchFailure(ctx, err) {
  const message = err?.message ?? String(err)
  ctx.logger.warn(`[clean-desktop-shell] shell launch failed: ${message}`)

  const logPath = launchLogPath()
  const body = [
    `time:     ${new Date().toISOString()}`,
    `platform: ${process.platform} (${process.arch})`,
    `node:     ${process.version}`,
    `dsh home: ${dshHome()}`,
    `runtime:  ${runtimeRoot()}`,
    `entry:    ${MAIN_JS}`,
    `error:    ${message}`,
    '',
    'Things worth checking:',
    '  - first launch downloads the Electron runtime; a blocked network fails here',
    '  - set DSH_SHELL_ELECTRON_DIR to an electron package to skip the download',
    '  - macOS binary: <runtime>/electron-v<ver>/Electron.app/Contents/MacOS/Electron',
    '  - macOS: unsandboxed extractors may drop the executable bit (chmod +x)',
    '',
  ].join('\n')

  try {
    appendFileSync(logPath, body + '\n')
    ctx.logger.warn(`[clean-desktop-shell] diagnostics written to ${logPath}`)
  } catch {
    // Nothing else a headless host process can do.
  }
}

function launchShell(exe, ctx) {
  if (launched) return
  const child = spawn(exe, [MAIN_JS], {
    cwd: PKG_ROOT,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
    stdio: 'ignore',
    windowsHide: false,
  })
  launched = true
  child.on('error', (err) => {
    launched = false
    ctx.logger.warn(`[clean-desktop-shell] shell spawn error: ${err.message}`)
  })
  child.on('exit', (code) => {
    launched = false
    ctx.logger.info(`[clean-desktop-shell] shell exited (${code})`)
  })
}
