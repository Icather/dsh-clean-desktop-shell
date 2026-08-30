/**
 * Shared constants and helpers for the host half modules.
 *
 * These compiled files sit at lib/<name>.js, so two dirname hops reach the
 * package root — the same layout as src/host/ before build, and the same
 * location electron/ and build/ live in the published package.
 */
import { homedir } from 'node:os'
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
