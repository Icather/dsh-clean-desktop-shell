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

const DEFAULT_PORT = 3080

let child = null
let currentStatus = 'stopped'
let lastError = null
let startResolver = null

export function getStatus() {
  return {
    status: currentStatus,
    port: DEFAULT_PORT,
    url: `http://127.0.0.1:${DEFAULT_PORT}`,
    error: lastError,
    pid: child?.pid ?? null,
  }
}

/** Simple HTTP probe — true when something responds on the port. */
export async function probe(url, timeoutMs = 1500) {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' })
    clearTimeout(timer)
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
  const url = `http://127.0.0.1:${DEFAULT_PORT}`
  const up = await probe(url)
  if (up) {
    currentStatus = 'running'
    return url
  }
  currentStatus = 'stopped'
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
    lastError = '未找到 dsh 后端。请在托盘「设置后端文件夹」中指定 dsh CLI 所在目录。'
    currentStatus = 'error'
    throw new Error(lastError)
  }

  currentStatus = 'starting'
  lastError = null
  child = spawn(resolved.command, [...resolved.args, 'web'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: { ...process.env, ...(resolved.env || {}) },
  })

  child.on('error', (err) => {
    lastError = err.message
    currentStatus = 'error'
    if (startResolver) {
      startResolver.reject(new Error(lastError))
      startResolver = null
    }
  })

  child.on('exit', (code) => {
    child = null
    if (currentStatus === 'starting' && startResolver) {
      lastError = `dsh 后端异常退出 (code ${code})`
      currentStatus = 'error'
      startResolver.reject(new Error(lastError))
      startResolver = null
    } else if (currentStatus !== 'stopped') {
      currentStatus = 'stopped'
    }
  })

  // Wait for the ready line with a timeout.
  return await new Promise((resolve, reject) => {
    startResolver = { resolve, reject }
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child?.kill()
      startResolver = null
      lastError = 'dsh 后端启动超时（45s）'
      currentStatus = 'error'
      reject(new Error(lastError))
    }, 45000)

    const onData = () => {
      const text = stdout + stderr
      const m = text.match(/http:\/\/127\.0\.0\.1:(\d+)/)
      if (m && startResolver) {
        clearTimeout(timer)
        currentStatus = 'running'
        startResolver.resolve(`http://127.0.0.1:${m[1]}`)
        startResolver = null
      }
    }
    child.stdout.on('data', (d) => {
      stdout += d.toString()
      onData()
    })
    child.stderr.on('data', (d) => {
      stderr += d.toString()
      onData()
    })
  })
}

/** Stop the local backend (spawned by us). External instances are left alone. */
export async function stop() {
  if (!child) {
    currentStatus = 'stopped'
    return
  }
  const proc = child
  child = null
  currentStatus = 'stopped'
  await new Promise((resolve) => {
    proc.once('exit', resolve)
    proc.kill()
    setTimeout(resolve, 3000)
  })
}

/** Restart the local backend. */
export async function restart(options) {
  await stop()
  return await start(options)
}

/** Locate a usable dsh CLI. */
async function resolveDshCommand(backendPath) {
  // 1) Explicit backend folder from config — look for dsh(.cmd/.exe) inside.
  if (backendPath) {
    const candidates = [
      joinCmd(backendPath, 'dsh.cmd'),
      joinCmd(backendPath, 'dsh'),
      joinCmd(backendPath, 'bin', 'dsh.cmd'),
      joinCmd(backendPath, 'node_modules', '.bin', 'dsh.cmd'),
    ]
    for (const c of candidates) {
      if (await exists(c)) return { command: c, args: [] }
    }
  }

  // 2) `dsh` on PATH
  if (await commandExists('dsh')) return { command: 'dsh', args: [] }

  // 3) Common locations (dev convenience).
  if (process.platform === 'win32') {
    const candidates = [
      'D:\\deepseek-harness\\prod\\node_modules\\.bin\\dsh.cmd',
      `${process.env.USERPROFILE}\\AppData\\Roaming\\npm\\dsh.cmd`,
    ]
    for (const c of candidates) {
      if (await exists(c)) return { command: c, args: [] }
    }
  }
  return null
}

function joinCmd(...parts) {
  return parts.join(process.platform === 'win32' ? '\\' : '/')
}

function commandExists(cmd) {
  return new Promise((resolve) => {
    const finder = process.platform === 'win32' ? 'where' : 'which'
    const c = spawn(finder, [cmd], { stdio: 'ignore', windowsHide: true })
    c.on('error', () => resolve(false))
    c.on('exit', (code) => resolve(code === 0))
  })
}

function exists(p) {
  return new Promise((resolve) => access(p, (err) => resolve(!err)))
}
