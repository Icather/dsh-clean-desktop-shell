/**
 * Local dsh web backend supervision.
 *
 * The shell owns the lifecycle of the dsh backend from the tray:
 *  - detect(): probe configured paths + default port
 *  - start() / stop() / restart()
 *  - status: 'running' | 'stopped' | 'starting' | 'error'
 *
 * Shell/core decoupling: when a remote target URL is configured, no local
 * backend is ever touched — this module only manages the local dsh CLI.
 */
import { spawn } from 'node:child_process'
import { access } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { loadConfig, DEFAULT_TARGET_URL } from './config.js'

// The local backend endpoint — derived from the shared default, never a
// duplicated literal.
const LOCAL_URL = DEFAULT_TARGET_URL
const DEFAULT_PORT = Number(new URL(DEFAULT_TARGET_URL).port) || 80

// Long-lived backend output must not accumulate without bound — keep the
// tail only (enough for ready-line matching and diagnostics).
const OUTPUT_CAP = 64 * 1024

function cappedAppend(prev, chunk) {
  const s = prev + chunk
  return s.length > OUTPUT_CAP ? s.slice(-OUTPUT_CAP) : s
}

let child = null
let currentStatus = 'stopped'
let lastError = null
let startResolver = null

// Status-change listeners (tray menu auto-refresh, window auto-reload, ...).
const listeners = new Set()

/** Subscribe to backend status changes. Returns an unsubscribe function. */
export function onStatusChange(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function setStatus(next, error = null) {
  if (currentStatus !== next || lastError !== error) {
    currentStatus = next
    lastError = error
    for (const cb of listeners) {
      try {
        cb(getStatus())
      } catch {
        // listener errors must not break the state machine
      }
    }
  }
}

export function getStatus() {
  return {
    status: currentStatus,
    port: DEFAULT_PORT,
    url: LOCAL_URL,
    error: lastError,
    pid: child?.pid ?? null,
  }
}

/** Simple HTTP probe — true when something responds on the port. */
export async function probe(url, timeoutMs = 1500) {
  try {
    // AbortSignal.timeout is the standard self-cleaning timeout — no manual
    // controller/timer pair to leak when fetch rejects first.
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' })
    return res.status < 500
  } catch {
    return false
  }
}

/**
 * Detect a reachable local dsh web service.
 * Returns the URL when something already listens on the port,
 * or null when the backend is down.
 */
export async function detect() {
  const up = await probe(LOCAL_URL)
  if (up) {
    setStatus('running')
    return LOCAL_URL
  }
  setStatus('stopped')
  return null
}

/**
 * Start the local dsh backend. Resolves once the service answers
 * (or a spawned CLI prints its ready line). Throws on failure.
 */
export async function start({ backendPath } = {}) {
  // Already up?
  const up = await detect()
  if (up) return up

  // Backend path: explicit config → common locations → PATH.
  const resolved = await resolveDshCommand(backendPath)
  if (!resolved) {
    setStatus('error', '未找到 dsh 后端。请在托盘「设置后端文件夹」中指定 dsh CLI 所在目录。')
    throw new Error(lastError)
  }

  setStatus('starting')

  // Windows: .cmd/.bat cannot be spawned directly — EINVAL. Route them
  // through the shell so `dsh.cmd web` behaves like a normal terminal.
  const isCmd = process.platform === 'win32' && /\.(cmd|bat)$/i.test(resolved.command)
  const command = isCmd ? `"${resolved.command}"` : resolved.command

  let spawned = null
  try {
    spawned = spawn(command, [...resolved.args, 'web'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: isCmd,
      env: { ...process.env, ...(resolved.env || {}) },
    })
  } catch (err) {
    // Synchronous spawn failures (e.g. EINVAL on Windows) must leave the
    // state machine in 'error' — otherwise the tray is stuck on 'starting'.
    setStatus('error', `后端启动失败：${err.message}`)
    throw new Error(lastError)
  }
  child = spawned

  child.on('error', (err) => {
    setStatus('error', err.message)
    if (startResolver) {
      const r = startResolver
      startResolver = null
      r.reject(new Error(lastError))
    }
  })

  child.on('exit', (code) => {
    child = null
    if (currentStatus === 'starting' && startResolver) {
      const r = startResolver
      startResolver = null
      setStatus('error', `dsh 后端异常退出 (code ${code})`)
      r.reject(new Error(lastError))
    } else if (currentStatus !== 'stopped') {
      setStatus('stopped')
    }
  })

  // Wait for readiness: ready line on stdout/stderr, or the port answering.
  return await new Promise((resolve, reject) => {
    startResolver = { resolve, reject }
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(async () => {
      if (!startResolver) return
      const r = startResolver
      startResolver = null
      // Timeout does not mean failure — the port may already be up while
      // the CLI never printed a parseable URL. Probe before giving up.
      if (await probe(LOCAL_URL, 1500)) {
        setStatus('running')
        r.resolve(LOCAL_URL)
        return
      }
      terminate(child)
      setStatus('error', 'dsh 后端启动超时（45s）')
      r.reject(new Error(lastError))
    }, 45000)

    const onData = () => {
      const text = stdout + stderr
      const m = text.match(/http:\/\/127\.0\.0\.1:(\d+)/)
      if (m && startResolver) {
        clearTimeout(timer)
        const r = startResolver
        startResolver = null
        const url = `http://127.0.0.1:${m[1]}`
        setStatus('running')
        r.resolve(url)
      }
    }
    child.stdout.on('data', (d) => {
      stdout = cappedAppend(stdout, d.toString())
      onData()
    })
    child.stderr.on('data', (d) => {
      stderr = cappedAppend(stderr, d.toString())
      onData()
    })
  })
}

/**
 * Stop the backend.
 *
 * - If the backend was spawned by us, terminate our child (tree kill — a
 *   shell-spawned .cmd can leave orphan node processes behind).
 * - Otherwise (an external instance, e.g. the user ran `dsh web` themselves)
 *   find the process listening on the port and terminate it, but only when
 *   it looks like a node-based backend, never an unrelated program.
 */
export async function stop() {
  if (child) {
    const proc = child
    child = null
    setStatus('stopped')
    await terminate(proc)
    await ensurePortFree(DEFAULT_PORT)
    return
  }

  // External instance: locate it by port and kill (node-only guard).
  const pid = await findProcessOnPort(DEFAULT_PORT)
  if (pid) {
    const name = await processName(pid)
    if (name && /node/i.test(name)) {
      await killProcess(pid)
      await ensurePortFree(DEFAULT_PORT)
    }
  }
  setStatus('stopped')
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Terminate a spawned backend and wait for it to exit.
 *
 * On Windows `proc.kill()` only reaches the direct child — when the command
 * is a .cmd shim, the node process it launched survives and keeps holding
 * the port. `taskkill /T` (tree kill) is the recognized fix. POSIX: SIGTERM
 * first, SIGKILL after a short grace period.
 */
async function terminate(proc) {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return
  const exited = new Promise((resolve) => proc.once('exit', resolve))
  if (process.platform === 'win32' && proc.pid) {
    await killProcess(proc.pid)
  } else {
    try {
      proc.kill('SIGTERM')
    } catch {
      // already gone
    }
  }
  const done = await Promise.race([exited.then(() => true), sleep(3000).then(() => false)])
  if (!done && process.platform !== 'win32') {
    try {
      proc.kill('SIGKILL')
    } catch {
      // already gone
    }
    await Promise.race([exited, sleep(1000)])
  }
}

/** Wait until nothing answers on the port (or give up after ~6s). */
async function ensurePortFree(port, tries = 12) {
  const url = `http://127.0.0.1:${port}`
  for (let i = 0; i < tries; i++) {
    if (!(await probe(url, 500))) return true
    await sleep(500)
  }
  return !(await probe(url, 500))
}

/** Find the PID listening on a TCP port (netstat on Windows, lsof elsewhere). */
function findProcessOnPort(port) {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32'
    const cmd = isWin ? 'netstat' : 'lsof'
    const args = isWin ? ['-ano'] : ['-ti', `:${port}`]
    const p = spawn(cmd, args, { windowsHide: true })
    let out = ''
    p.stdout.on('data', (d) => {
      out += d.toString()
    })
    p.on('error', () => resolve(null))
    p.on('exit', () => {
      if (isWin) {
        const re = new RegExp(`\\bTCP\\s+[^\\s]*:${port}\\s+[^\\s]*\\s+LISTENING\\s+(\\d+)`)
        const m = out.match(re)
        resolve(m ? m[1] : null)
      } else {
        const pid = out.split(/\r?\n/).map((s) => s.trim()).find(Boolean)
        resolve(pid || null)
      }
    })
  })
}

/** Process image name for a PID (Windows tasklist; null elsewhere). */
function processName(pid) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve(null)
      return
    }
    const p = spawn('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {
      windowsHide: true,
    })
    let out = ''
    p.stdout.on('data', (d) => {
      out += d.toString()
    })
    p.on('error', () => resolve(null))
    p.on('exit', () => {
      // CSV row: "image name","pid","session name",...
      const m = out.match(/"([^"]+)","(\d+)"/)
      resolve(m ? m[1] : null)
    })
  })
}

/** Force-kill a process (taskkill on Windows, kill -9 elsewhere). */
function killProcess(pid) {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32'
    const cmd = isWin ? 'taskkill' : 'kill'
    const args = isWin ? ['/PID', String(pid), '/F', '/T'] : ['-9', String(pid)]
    const p = spawn(cmd, args, { windowsHide: true, stdio: 'ignore' })
    p.on('error', () => resolve(false))
    p.on('exit', () => resolve(true))
  })
}

/** Restart the local backend. */
export async function restart(options) {
  await stop()
  return await start(options)
}

/**
 * Check whether a folder contains a usable dsh CLI.
 * Returns the resolved executable path, or null.
 */
export async function findDshInFolder(folder) {
  if (!folder) return null
  const candidates = [
    joinCmd(folder, 'dsh.cmd'),
    joinCmd(folder, 'dsh'),
    joinCmd(folder, 'bin', 'dsh.cmd'),
    joinCmd(folder, 'node_modules', '.bin', 'dsh.cmd'),
  ]
  for (const c of candidates) {
    if (await exists(c)) return c
  }
  return null
}

/**
 * Candidate dsh CLI locations beyond the explicit config path:
 * the DSH_BACKEND_DIR env var (documented, machine-independent) and the
 * npm global bin dir. The previous list carried a developer-specific
 * absolute path — removed in favor of config (backendPath) and env.
 */
function fallbackCandidates() {
  const list = []
  const envDir = process.env.DSH_BACKEND_DIR
  if (envDir) list.push(join(envDir, 'dsh.cmd'), join(envDir, 'dsh'))
  if (process.platform === 'win32') {
    list.push(join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'npm', 'dsh.cmd'))
  } else {
    list.push('/usr/local/bin/dsh', join(homedir(), '.local', 'bin', 'dsh'))
  }
  return list
}

/**
 * Auto-detect the dsh install folder (the folder that contains the dsh
 * CLI), following the same resolution order used to start the backend:
 * config → DSH_BACKEND_DIR → PATH → npm global. Returns the folder or null.
 */
export async function detectInstallFolder() {
  // 1) Explicit backend folder from config.
  const cfgPath = getConfiguredBackendPath()
  if (cfgPath) {
    const found = await findDshInFolder(cfgPath)
    if (found) return dirOf(found)
  }

  // 2) Candidates: DSH_BACKEND_DIR env, then npm global bin.
  for (const c of fallbackCandidates()) {
    if (await exists(c)) return dirOf(c)
  }

  // 3) `dsh` on PATH → resolve where it actually lives.
  const onPath = await commandPath('dsh')
  if (onPath) return dirOf(onPath)
  return null
}

/** Locate a usable dsh CLI. */
async function resolveDshCommand(backendPath) {
  // 1) Explicit backend folder from config — look for dsh(.cmd/.exe) inside.
  if (backendPath) {
    const found = await findDshInFolder(backendPath)
    if (found) return { command: found, args: [] }
  }

  // 2) Candidates: DSH_BACKEND_DIR env, then npm global bin.
  for (const c of fallbackCandidates()) {
    if (await exists(c)) return { command: c, args: [] }
  }

  // 3) `dsh` on PATH — resolve to the real file so .cmd/.bat gets the
  //    shell treatment (a bare `spawn('dsh')` would ENOENT on Windows).
  const onPath = await commandPath('dsh')
  if (onPath) {
    return { command: /\.(cmd|bat)$/i.test(onPath) ? onPath : 'dsh', args: [] }
  }
  return null
}

function joinCmd(...parts) {
  return parts.join(process.platform === 'win32' ? '\\' : '/')
}

function dirOf(p) {
  return dirname(p)
}

function getConfiguredBackendPath() {
  try {
    return loadConfig().backendPath || null
  } catch {
    return null
  }
}

/** Resolve a command on PATH to its absolute path (Windows: where.exe). */
function commandPath(cmd) {
  return new Promise((resolve) => {
    const finder = process.platform === 'win32' ? 'where' : 'which'
    const c = spawn(finder, [cmd], { windowsHide: true })
    let out = ''
    c.stdout.on('data', (d) => {
      out += d.toString()
    })
    c.on('error', () => resolve(null))
    c.on('exit', () => {
      const line = out.split(/\r?\n/).map((s) => s.trim()).find(Boolean)
      resolve(line || null)
    })
  })
}

function exists(p) {
  return new Promise((resolve) => access(p, (err) => resolve(!err)))
}
