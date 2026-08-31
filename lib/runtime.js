/**
 * Electron runtime provisioning for the plugin-market (branch 2) shell.
 *
 * The electron runtime is NOT an npm dependency (electron-builder forbids
 * electron in "dependencies", and pnpm's allowBuilds would block its
 * postinstall anyway). This module provisions it under
 * $DSH_HOME/desktop-shell-runtime/electron-v<ver>/:
 *
 *   1. resolve the version (package.json → desktopShell.electronVersion)
 *   2. if that version dir exists → reuse it
 *   3. otherwise reuse a local electron package (DSH_SHELL_ELECTRON_DIR),
 *      else download the official zip from the fastest reachable source
 *   4. drop stale electron-v* dirs (no unbounded disk growth)
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
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
import { pipeline } from 'node:stream/promises'
import { basename, join } from 'node:path'
import {
  PKG_ROOT,
  EXE_RELPATH,
  EXE_TOP,
  ARCH,
  PLATFORM,
  isWin,
  isMac,
  runtimeRoot,
  fetchFile,
} from './common.js'

function electronVersion() {
  try {
    const meta = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'))
    return meta.desktopShell?.electronVersion || null
  } catch {
    return null
  }
}

function versionDir(root, version) {
  return join(root, `electron-v${version}`)
}

function zipName(version) {
  return `electron-v${version}-${PLATFORM}-${ARCH}.zip`
}

/** Resolve (or provision) the runtime and return the electron exe path. */
export async function ensureRuntime(ctx) {
  const version = electronVersion()
  if (!version) throw new Error('desktopShell.electronVersion missing in package.json')
  const root = runtimeRoot()
  const dir = versionDir(root, version)
  const exe = join(dir, EXE_RELPATH)

  // 1) Already provisioned for this version?
  if (existsSync(exe)) {
    cleanupOldVersions(root, dir)
    if (!isWin) await ensureExecutable(ctx, exe)
    return exe
  }

  // 2) Local reuse: DSH_SHELL_ELECTRON_DIR → link/copy its dist/ (fast).
  const localSrc = process.env.DSH_SHELL_ELECTRON_DIR
  if (localSrc) {
    const srcExe = join(localSrc, 'dist', EXE_RELPATH)
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
    // Name the exact path we expected. Without it a user on an untested
    // platform has nothing to report back (this failure used to be silent).
    throw new Error(
      `electron runtime provisioning failed — expected binary at ${exe} ` +
        `(platform=${PLATFORM} arch=${ARCH}, layout differs per platform); ` +
        'check network, or point DSH_SHELL_ELECTRON_DIR at an electron package',
    )
  }
  cleanupOldVersions(root, dir)
  if (!isWin) await ensureExecutable(ctx, exe)
  ctx.logger.info(`[clean-desktop-shell] electron runtime ${version} ready at ${dir}`)
  return exe
}

/**
 * Zip extraction does not reliably restore the executable bit — bsdtar
 * (Windows tar.exe, macOS /usr/bin/tar) in particular drops it — and a
 * non-executable binary fails later with a bare EACCES on spawn. Guarantee
 * it instead of trusting the extractor.
 */
function ensureExecutable(ctx, target) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn('chmod', ['+x', target], { stdio: 'ignore' })
    } catch {
      return resolve(false)
    }
    child.on('error', () => resolve(false))
    child.on('exit', (code) => {
      if (code !== 0) {
        ctx.logger.warn(`[clean-desktop-shell] chmod +x failed (exit ${code}) on ${target}`)
      }
      resolve(code === 0)
    })
  })
}

async function downloadRuntime(ctx, version, root, dir) {
  const tmpZip = join(root, `.electron-${version}.zip.tmp`)
  rmSync(tmpZip, { force: true })
  const candidates = await runtimeCandidates(version)
  const zip = zipName(version)
  const innerName = zip.replace(/\.zip$/, '')

  for (const c of candidates) {
    ctx.logger.info(`[clean-desktop-shell] downloading electron ${version} from ${c.url}`)
    if (!(await fetchFile(c.url, tmpZip))) {
      // Failed download — drop the partial file so a later run starts clean.
      rmSync(tmpZip, { force: true })
      continue
    }

    // Integrity check against the source's own SHASUMS256.txt (same check
    // the `electron` package's installer performs). A mismatch means the
    // bytes are corrupt or tampered — the source is skipped entirely.
    if (!(await verifySha256(ctx, tmpZip, c.shasums, zip))) {
      rmSync(tmpZip, { force: true })
      continue
    }

    // Extract into a scratch dir, never into the shared runtime root: a
    // half-extracted zip there would be indistinguishable from a real
    // runtime, and the sibling electron-v* dirs must not be disturbed.
    const scratch = join(root, `.extract-${version}-${Date.now()}`)
    const ok = await extractZip(ctx, tmpZip, scratch)
    rmSync(tmpZip, { force: true })
    if (!ok) {
      ctx.logger.warn(`[clean-desktop-shell] no extractor succeeded for ${c.url}`)
      rmSync(scratch, { recursive: true, force: true })
      continue
    }

    // Both archive layouts exist in the wild: some Electron zips wrap
    // everything in a dir named after the zip, others (notably darwin, whose
    // payload is Electron.app/) unpack flat into the destination. Detect
    // rather than assume — the old code assumed the wrapper and silently
    // produced nothing on macOS.
    const payload = findPayload(scratch, join(scratch, innerName))
    if (!payload) {
      ctx.logger.warn(
        `[clean-desktop-shell] unexpected archive layout: no ${EXE_TOP} under ${scratch}`,
      )
      rmSync(scratch, { recursive: true, force: true })
      continue
    }

    movePayloadInto(dir, payload)
    rmSync(scratch, { recursive: true, force: true })
    if (isMac) await clearQuarantine(ctx, join(dir, EXE_TOP))
    return
  }
  throw new Error('electron download failed from all sources')
}

/**
 * Verify a downloaded zip against the source's SHASUMS256.txt — the same
 * integrity check the `electron` package's own installer performs. Returns
 * false on a checksum mismatch (fatal for that source); a temporarily
 * unreachable SHASUMS file only warns, so a reachable zip is not wasted
 * over an unrelated blocker.
 */
async function verifySha256(ctx, file, shasumsUrl, name) {
  let expected = null
  let reason = ''
  try {
    const res = await fetch(shasumsUrl, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) {
      reason = `HTTP ${res.status}`
    } else {
      const text = await res.text()
      for (const line of text.split('\n')) {
        const m = line.trim().match(/^([0-9a-f]{64})\s+\*?(.+)$/i)
        if (m && m[2].trim() === name) {
          expected = m[1].toLowerCase()
          break
        }
      }
      if (!expected) reason = 'entry not found'
    }
  } catch (err) {
    reason = err?.message || 'fetch failed'
  }
  if (!expected) {
    ctx.logger.warn(
      `[clean-desktop-shell] SHASUMS256.txt unavailable from ${shasumsUrl} (${reason}) — skipping integrity check`,
    )
    return true
  }
  // Stream the hash — the zip can be ~270 MB and must not be read whole
  // into memory.
  const hash = createHash('sha256')
  await pipeline(createReadStream(file), hash)
  const actual = hash.digest('hex')
  if (actual !== expected) {
    ctx.logger.warn(
      `[clean-desktop-shell] checksum mismatch for ${name}: expected ${expected}, got ${actual}`,
    )
    return false
  }
  return true
}

/** The dir that directly holds the electron payload right after extraction. */
function findPayload(scratch, wrapper) {
  if (existsSync(join(wrapper, EXE_TOP))) return wrapper
  if (existsSync(join(scratch, EXE_TOP))) return scratch
  return null
}

function movePayloadInto(dir, payload) {
  rmSync(dir, { recursive: true, force: true })
  renameSync(payload, dir)
}

/**
 * macOS: a bundle carrying com.apple.quarantine is refused by Gatekeeper with
 * the infamous "已损坏，无法打开" dialog. We download with curl (which does
 * not set the attribute), but archive members themselves can carry it, so
 * clear it once right after extraction rather than debugging it per user.
 */
function clearQuarantine(ctx, target) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn('xattr', ['-cr', target], { windowsHide: true, stdio: 'ignore' })
    } catch {
      return resolve(false)
    }
    child.on('error', () => resolve(false))
    child.on('exit', (code) => {
      ctx.logger.info(
        code === 0
          ? `[clean-desktop-shell] cleared extended attributes on ${target}`
          : `[clean-desktop-shell] xattr cleanup skipped (exit ${code})`,
      )
      resolve(code === 0)
    })
  })
}

/**
 * Pick the download source by racing a HEAD probe against each candidate
 * (direct connection, 3s each). The fastest reachable source goes first —
 * this naturally prefers the domestic npmmirror mirror on CN networks,
 * the official GitHub source on international/well-proxied networks, and
 * never wastes a full download on a dead source. Each candidate carries
 * its own SHASUMS256.txt location for the post-download integrity check.
 */
async function runtimeCandidates(version) {
  const base = (name, urlBase) => ({
    name,
    url: `${urlBase}/${zipName(version)}`,
    shasums: `${urlBase}/SHASUMS256.txt`,
  })
  const candidates = [
    base('github', `https://github.com/electron/electron/releases/download/v${version}`),
    base('npmmirror', `https://npmmirror.com/mirrors/electron/${version}`),
  ]
  const results = await Promise.all(
    candidates.map(async (c) => {
      const t0 = Date.now()
      try {
        // AbortSignal.timeout — the standard self-cleaning probe timeout.
        const res = await fetch(c.url, { signal: AbortSignal.timeout(3000), method: 'HEAD' })
        if (res.status < 500) return { ...c, ms: Date.now() - t0 }
      } catch {
        // unreachable — drop
      }
      return null
    }),
  )
  const ok = results.filter(Boolean).sort((a, b) => a.ms - b.ms)
  if (ok.length === 0) {
    // Probes all failed (offline?) — still try both, mirror first (cheap).
    return [candidates[1], candidates[0]]
  }
  const rest = candidates.filter((c) => c.url !== ok[0].url)
  return [ok[0], ...rest]
}

/**
 * Extract a zip using whatever the platform actually provides.
 *
 * The archives are ordinary zips, but the readers differ:
 *   - Windows: bsdtar ships as tar.exe and reads zip; Expand-Archive is the
 *     fallback for hardened images where tar is unavailable.
 *   - macOS:   ditto -xk is Apple's own extractor and preserves the symlinks
 *              inside Electron.app; unzip next; bsdtar last.
 *   - Linux:   unzip, then tar.
 *
 * Success is decided by the caller (findPayload), not by the exit code — a
 * zip can unpack "successfully" into a layout nobody expects.
 */
function extractZip(ctx, zipPath, dest) {
  const strategies = isWin
    ? [
        { cmd: 'tar', args: ['-xf', zipPath, '-C', dest] },
        {
          cmd: 'powershell',
          args: [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${dest.replace(/'/g, "''")}' -Force`,
          ],
        },
      ]
    : isMac
      ? [
          { cmd: 'ditto', args: ['-xk', zipPath, dest] },
          { cmd: 'unzip', args: ['-q', '-o', zipPath, '-d', dest] },
          { cmd: 'tar', args: ['-xf', zipPath, '-C', dest] },
        ]
      : [
          { cmd: 'unzip', args: ['-q', '-o', zipPath, '-d', dest] },
          { cmd: 'tar', args: ['-xf', zipPath, '-C', dest] },
        ]

  return (async () => {
    mkdirSync(dest, { recursive: true })
    for (const s of strategies) {
      const ok = await runExtractor(s.cmd, s.args)
      if (ok) {
        ctx.logger.info(`[clean-desktop-shell] extracted with ${s.cmd}`)
        return true
      }
      ctx.logger.warn(`[clean-desktop-shell] extractor unavailable or failed: ${s.cmd}`)
    }
    return false
  })()
}

function runExtractor(cmd, args) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(cmd, args, { windowsHide: true, stdio: 'ignore' })
    } catch {
      return resolve(false)
    }
    child.on('error', () => resolve(false))
    child.on('exit', (code) => resolve(code === 0))
  })
}

/**
 * Drop version dirs older than the current one (dead weight), plus any
 * scratch dir a crashed extraction left behind.
 */
function cleanupOldVersions(root, currentDir) {
  try {
    for (const entry of readdirSync(root)) {
      const isStaleRuntime = entry.startsWith('electron-v')
      const isScratch = entry.startsWith('.extract-') || entry.startsWith('.electron-')
      if (!isStaleRuntime && !isScratch) continue
      const full = join(root, entry)
      if (full === currentDir) continue
      rmSync(full, { recursive: true, force: true })
    }
  } catch {
    // best-effort
  }
}

/**
 * Provision a local electron package's dist/ as the version dir itself, so
 * the layout matches a downloaded runtime: <dir>/<EXE_RELPATH> at the
 * version-dir root (on macOS that is <dir>/Electron.app/Contents/MacOS/Electron).
 *
 * Windows: junction (zero-copy, instant) — a 269MB recursive cpSync can be
 * killed by sandbox/AV on large trees, so only fall back to a copy.
 * macOS/Linux: a symlink to dist/ would work too, but a bare .app reached
 * through a symlink is a common source of Gatekeeper/entitlement surprises,
 * so always copy there.
 */
function provisionLocalDist(srcPkg, destDir) {
  if (process.platform === 'win32') {
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
