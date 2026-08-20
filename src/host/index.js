/**
 * dsh-clean-desktop-shell — host half (plugin loader entry).
 *
 * Branch 2 (plugin-market distribution): when installed through the DSH
 * plugin market, this host half brings up the Electron shell itself.
 *
 * The electron runtime is NOT an npm dependency (electron-builder forbids
 * electron in "dependencies", and pnpm's allowBuilds would block its
 * postinstall anyway). Instead the host half manages the runtime on its
 * own, under $DSH_HOME/desktop-shell-runtime/:
 *
 *   1. resolve the version to run (package.json → desktopShell.electronVersion)
 *   2. if that version dir exists → reuse it
 *   3. otherwise download the electron zip from the best source for the
 *      network (official GitHub releases vs npmmirror mirror), extract it,
 *      and drop any older version dirs (no unbounded disk growth)
 *   4. spawn the shell (runtime electron + electron/main.js) — the same
 *      code branch 1 (installer) ships
 *
 * Window, tray, backend management etc. are identical to branch 1; only
 * the runtime provisioning differs.
 */
import { spawn } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const MAIN_JS = join(PKG_ROOT, 'electron', 'main.js')
const isWin = process.platform === 'win32'
const EXE_NAME = isWin ? 'electron.exe' : 'electron'
const ARCH = process.arch === 'arm64' ? 'arm64' : 'x64'
const PLATFORM = isWin ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux'

// Disable auto-launch with DSH_SHELL_AUTO_LAUNCH=0.
const AUTO_LAUNCH = process.env.DSH_SHELL_AUTO_LAUNCH !== '0'

let launched = false

export function apply(ctx) {
  ctx.on('ready', async () => {
    ctx.logger.info('[clean-desktop-shell] mounted (host half)')
    if (!AUTO_LAUNCH) return
    try {
      const exe = await ensureRuntime(ctx)
      launchShell(exe, ctx)
    } catch (err) {
      ctx.logger.warn(`[clean-desktop-shell] shell launch failed: ${err?.message ?? err}`)
    }
  })
}

// ---------- electron runtime provisioning ----------

function electronVersion() {
  try {
    const meta = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'))
    return meta.desktopShell?.electronVersion || null
  } catch {
    return null
  }
}

function runtimeRoot() {
  return join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'desktop-shell-runtime')
}

function versionDir(root, version) {
  return join(root, `electron-v${version}`)
}

function zipName(version) {
  return `electron-v${version}-${PLATFORM}-${ARCH}.zip`
}

async function ensureRuntime(ctx) {
  const version = electronVersion()
  if (!version) throw new Error('desktopShell.electronVersion missing in package.json')
  const root = runtimeRoot()
  const dir = versionDir(root, version)
  const exe = join(dir, EXE_NAME)

  // 1) Already provisioned for this version?
  if (existsSync(exe)) {
    cleanupOldVersions(root, dir)
    return exe
  }

  // 2) Local reuse: DSH_SHELL_ELECTRON_DIR → link/copy its dist/ (fast).
  const localSrc = process.env.DSH_SHELL_ELECTRON_DIR
  if (localSrc) {
    const srcExe = join(localSrc, 'dist', EXE_NAME)
    if (existsSync(srcExe) && provisionLocalDist(localSrc, dir)) {
      ctx.logger.info(`[clean-desktop-shell] reused electron runtime from ${localSrc}`)
    }
  }

  // 3) Download + extract the official zip from a network-appropriate source.
  if (!existsSync(exe)) {
    mkdirSync(root, { recursive: true })
    await downloadRuntime(ctx, version, root, dir)
  }

  if (!existsSync(exe)) {
    throw new Error(
      'electron runtime provisioning failed — check network, or point DSH_SHELL_ELECTRON_DIR at an electron package',
    )
  }
  cleanupOldVersions(root, dir)
  ctx.logger.info(`[clean-desktop-shell] electron runtime ${version} ready at ${dir}`)
  return exe
}

async function downloadRuntime(ctx, version, root, dir) {
  const tmpZip = join(root, `.electron-${version}.zip.tmp`)
  rmSync(tmpZip, { force: true })
  const urls = await runtimeUrls(version)
  for (const url of urls) {
    ctx.logger.info(`[clean-desktop-shell] downloading electron ${version} from ${url}`)
    if (await fetchFile(url, tmpZip)) {
      // Zip extracts to an inner dir named like the zip basename.
      const inner = join(root, zipName(version).replace(/\.zip$/, ''))
      try {
        await extractZip(tmpZip, root)
        if (existsSync(join(inner, EXE_NAME)) && inner !== dir) {
          rmSync(dir, { recursive: true, force: true })
          renameSync(inner, dir)
        }
        rmSync(tmpZip, { force: true })
        return
      } catch (err) {
        ctx.logger.warn(`[clean-desktop-shell] extract failed: ${err?.message ?? err}`)
        rmSync(inner, { recursive: true, force: true })
      }
    }
  }
  throw new Error('electron download failed from all sources')
}

/** Probe GitHub; reachable → official releases, else the npmmirror mirror. */
async function runtimeUrls(version) {
  const official = `https://github.com/electron/electron/releases/download/v${version}/${zipName(version)}`
  const mirror = `https://npmmirror.com/mirrors/electron/${version}/${zipName(version)}`
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 3000)
    const res = await fetch('https://github.com', { signal: ctrl.signal, method: 'HEAD' })
    clearTimeout(timer)
    if (res.status < 500) return [official, mirror]
  } catch {
    // unreachable — mirror first
  }
  return [mirror, official]
}

function fetchFile(url, dest) {
  return new Promise((resolve) => {
    // curl is available on Windows 10+; streams to disk, honors proxy env.
    const child = spawn('curl', ['-L', '--fail', '--silent', '--show-error', '-o', dest, url], {
      windowsHide: true,
      stdio: 'ignore',
    })
    child.on('error', () => resolve(false))
    child.on('exit', (code) => resolve(code === 0))
  })
}

function extractZip(zipPath, dest) {
  // Windows ships bsdtar (tar.exe) which reads zip; fall back to
  // PowerShell Expand-Archive if needed.
  const child = spawn('tar', ['-xf', zipPath, '-C', dest], { windowsHide: true, stdio: 'ignore' })
  return new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`tar exit ${code}`))))
  })
}

/** Remove version dirs older than the current one (dead weight). */
function cleanupOldVersions(root, currentDir) {
  try {
    for (const entry of readdirSync(root)) {
      if (!entry.startsWith('electron-v')) continue
      const full = join(root, entry)
      if (full === currentDir) continue
      rmSync(full, { recursive: true, force: true })
    }
  } catch {
    // best-effort
  }
}

/**
 * Provision a local electron package's dist/ as the version dir itself,
 * so the layout matches a downloaded runtime: <dir>/electron(.exe) at the
 * version-dir root. Windows: junction (zero-copy, instant) — a 269MB
 * recursive cpSync can be killed by sandbox/AV on large trees, so only
 * fall back to a copy.
 */
function provisionLocalDist(srcPkg, destDir) {
  if (isWin) {
    try {
      rmSync(destDir, { recursive: true, force: true })
      symlinkSync(join(srcPkg, 'dist'), destDir, 'junction')
      return true
    } catch {
      // fall through to a real copy
    }
  }
  try {
    rmSync(destDir, { recursive: true, force: true })
    cpSync(join(srcPkg, 'dist'), destDir, { recursive: true })
    return true
  } catch {
    return false
  }
}

// ---------- shell launch ----------

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
