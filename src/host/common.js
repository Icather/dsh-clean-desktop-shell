/**
 * Shared constants and helpers for the host half modules.
 *
 * These compiled files sit at lib/<name>.js, so two dirname hops reach the
 * package root — the same layout as src/host/ before build, and the same
 * location electron/ and build/ live in the published package.
 */
import { homedir } from 'node:os'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PKG_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
export const MAIN_JS = join(PKG_ROOT, 'electron', 'main.js')
export const isWin = process.platform === 'win32'
export const isMac = process.platform === 'darwin'
export const ARCH = process.arch === 'arm64' ? 'arm64' : 'x64'
export const PLATFORM = isWin ? 'win32' : isMac ? 'darwin' : 'linux'

/**
 * Electron binary path *relative to the extracted runtime dir*.
 *
 * The three upstream archives do not share a layout — only darwin ships an
 * app bundle, and it is the one case with no top-level executable:
 *   win32  → electron.exe
 *   linux  → electron
 *   darwin → Electron.app/Contents/MacOS/Electron
 *
 * Authoritative source: the `electron` package's own install.js, which writes
 * exactly this relative path into path.txt for `require('electron')`.
 */
export const EXE_RELPATH = isWin
  ? 'electron.exe'
  : isMac
    ? join('Electron.app', 'Contents', 'MacOS', 'Electron')
    : 'electron'

/** First path segment of EXE_RELPATH — what a successful extract must leave behind. */
export const EXE_TOP = isWin ? 'electron.exe' : isMac ? 'Electron.app' : 'electron'

/** DSH home, honouring DSH_HOME the same way dsh-home-paths does. */
export function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

/** Where the self-provisioned runtimes live (shared with icon.js). */
export function runtimeRoot() {
  return join(dshHome(), 'desktop-shell-runtime')
}

/** Launch diagnostics land here — the only thing a headless user can send us. */
export function launchLogPath() {
  return join(dshHome(), 'desktop-shell-launch.log')
}

/**
 * Download a file to disk via curl — shared by runtime provisioning and
 * icon patching. Chosen over native fetch because undici (Node's fetch)
 * ignores HTTP(S)_PROXY env vars unless a proxy dispatcher is wired in,
 * while curl honors them out of the box (users behind Clash/v2ray rely on
 * that). --max-time keeps a stalled proxy from hanging forever; --retry
 * rides out transient failures.
 */
export function fetchFile(url, dest, timeoutSec = 600) {
  return new Promise((resolve) => {
    const child = spawn(
      'curl',
      ['-L', '--fail', '--silent', '--show-error', '--retry', '2', '--max-time', String(timeoutSec), '-o', dest, url],
      { windowsHide: true, stdio: 'ignore' },
    )
    child.on('error', () => resolve(false))
    child.on('exit', (code) => resolve(code === 0))
  })
}
