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
import { ensureRcedit, patchExeIcon } from './icon.js'

// cordis registers the plugin by this name — bundles without an explicit
// `name` export are silently skipped by the dsh loader.
export const name = 'dsh-clean-desktop-shell'

// Disable auto-launch with DSH_SHELL_AUTO_LAUNCH=0.
const AUTO_LAUNCH = process.env.DSH_SHELL_AUTO_LAUNCH !== '0'

/**
 * Hard budget for the taskbar-icon step. It runs before the spawn (Windows
 * locks a running image), so it is on the launch path — but the icon is
 * cosmetic and must never decide when the window appears. Without a budget a
 * stalled rcedit fetch held the first launch for up to the fetchFile default
 * of 600 s; with it, the worst case is 25 s and the usual case is ~0 (the
 * fetch has already finished behind the Electron runtime download).
 */
const ICON_PATCH_DEADLINE_MS = 25000

let launched = false

/**
 * Let a best-effort step run, but never wait longer than `ms` for it. Whatever
 * it was doing keeps running in the background.
 */
function withDeadline(ctx, promise, ms) {
  let timer
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => {
      ctx.logger.warn(`[clean-desktop-shell] icon step exceeded ${ms} ms — launching without it`)
      resolve()
    }, ms)
    // Do not keep the host process alive just to fire a warning.
    timer.unref?.()
  })
  const settled = promise.then(() => {}, () => {})
  return Promise.race([settled, deadline]).finally(() => clearTimeout(timer))
}

export function apply(ctx) {
  ctx.logger.info('[clean-desktop-shell] mounted (host half)')
  if (!AUTO_LAUNCH) return

  // Runtime preparation is independent of authentication — start it now, but
  // defer the Electron spawn until the launch URL is minted below.
  let runtimeExe = null
  // Kick the (tiny) rcedit fetch off alongside the (large) Electron runtime so
  // the two never serialise; patchExeIcon reuses this same memoised promise.
  void ensureRcedit(ctx)
  const runtimeReady = ensureRuntime(ctx)
    .then(async (exe) => {
      runtimeExe = exe
      await withDeadline(ctx, patchExeIcon(ctx, exe), ICON_PATCH_DEADLINE_MS)
    })
    .catch((err) => {
      reportLaunchFailure(ctx, err)
    })

  // DSH 0.1.2 BrowserAuth: the shell must not start on bare "/" (401). It
  // needs this process's launch URL (?token=…), which the Connection service
  // alone can mint. The service is only reachable from a deferred inject
  // scope — reading ctx.connection in apply() throws "cannot get property
  // without inject" — and the URL is a readiness signal: mint it only after
  // the Loader tree settles, because the port answers 4xx before settlement.
  // Mirror @deepseek-ai/dsh-web-app's announce pattern.
  ctx.inject(['connection'], (connectionCtx) => {
    const launch = () => {
      if (launched) return
      // Only injected services are directly reachable in this scope; the
      // webServer sibling is read through get() (see web-app: it may declare
      // webServer in its row inject, this host does not).
      const webServer = connectionCtx.get('webServer')
      if (!webServer) return
      try {
        const webUrl = `http://127.0.0.1:${String(webServer.port)}`
        // dsh 0.1.2+ mints this process's launch URL through BrowserAuth.
        // Older versions have no BrowserAuth at all — they serve the web root
        // unauthenticated — so a missing mint must NOT stop the launch: the
        // shell just starts with no bootstrap URL, which is exactly the
        // pre-0.1.2 behaviour.
        const mint = connectionCtx.connection.authenticatedUrl
        const launchUrl = typeof mint === 'function' ? mint.call(connectionCtx.connection, webUrl) : null
        void runtimeReady.then(() => {
          if (runtimeExe) launchShell(runtimeExe, connectionCtx, launchUrl)
        })
      } catch (err) {
        reportLaunchFailure(connectionCtx, err)
      }
    }
    // This row's own activation can precede a sibling failure. The tree owns
    // readiness: await the Loader, then re-check that the services still
    // exist — an early shutdown must not spawn a shell for a dead server.
    const settled = connectionCtx.get('loader')?.await()
    if (settled === undefined) launch()
    else {
      void settled.then(() => {
        if (connectionCtx.get('webServer') !== undefined
          && connectionCtx.get('connection') !== undefined) launch()
      }, () => {})
    }
  })
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

function launchShell(exe, ctx, launchUrl) {
  if (launched) return
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: undefined }
  if (launchUrl) env.DSH_WEB_LAUNCH_URL = launchUrl
  const child = spawn(exe, [MAIN_JS], {
    cwd: PKG_ROOT,
    env,
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
