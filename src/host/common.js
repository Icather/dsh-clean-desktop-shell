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
export const EXE_NAME = isWin ? 'electron.exe' : 'electron'
export const ARCH = process.arch === 'arm64' ? 'arm64' : 'x64'
export const PLATFORM = isWin ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux'

/** Where the self-provisioned runtimes live (shared with icon.js). */
export function runtimeRoot() {
  return join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'desktop-shell-runtime')
}
