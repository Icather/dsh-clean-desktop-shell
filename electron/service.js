/**
 * Local dsh web service supervision.
 *
 * Checks whether the target port already serves a dsh web instance; if not,
 * spawns `dsh web` and waits for the ready line. The service is decoupled
 * from the shell: when a remote target URL is configured, no local process
 * is ever started.
 */
import { spawn } from 'node:child_process'
import { access } from 'node:fs'

const DEFAULT_PORT = 3080

/** Simple HTTP probe — returns true when something responds on the port. */
export async function probe(url, timeoutMs = 1500) {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' })
    clearTimeout(timer)
    // A 200/3xx from dsh web means the service is up.
    return res.status < 500
  } catch {
    return false
  }
}

/**
 * Ensure a dsh web instance is reachable on the given port.
 * Returns the resolved URL, or throws when the service cannot be started.
 */
export async function ensureService({ port = DEFAULT_PORT, command = 'dsh' } = {}) {
  const url = `http://127.0.0.1:${port}`
  const up = await probe(url)
  if (up) return url

  // Try to locate the dsh CLI. Prefer the global command; fall back to a
  // DSH installation found via common locations on Windows.
  const resolved = await resolveDshCommand()
  if (!resolved) {
    throw new Error(
      `No dsh web service on ${url} and no dsh CLI found to start it. ` +
        `Start 'dsh web' manually, or set targetUrl in the shell config.`,
    )
  }

  const child = spawn(resolved.command, [...resolved.args, 'web'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: { ...process.env, ...(resolved.env || {}) },
  })

  // Wait for the ready line ("dsh web: http://127.0.0.1:<port>") with a timeout.
  const ready = await new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      resolve(null)
    }, 45000)
    const onData = () => {
      const text = stdout + stderr
      const m = text.match(/http:\/\/127\.0\.0\.1:(\d+)/)
      if (m) {
        clearTimeout(timer)
        resolve(`http://127.0.0.1:${m[1]}`)
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
    child.on('error', () => {
      clearTimeout(timer)
      resolve(null)
    })
    child.on('exit', () => {
      clearTimeout(timer)
      resolve(null)
    })
  })

  if (!ready) {
    throw new Error(`dsh web did not become ready within 45s on ${url}.`)
  }
  return ready
}

/** Locate a usable dsh CLI. */
async function resolveDshCommand() {
  // 1) `dsh` on PATH
  const onPath = await commandExists('dsh')
  if (onPath) return { command: 'dsh', args: [] }

  // 2) Common Windows install locations (dev convenience).
  if (process.platform === 'win32') {
    const candidates = [
      // DSH prod checkout layout used on this machine
      'D:\\deepseek-harness\\prod\\node_modules\\.bin\\dsh.cmd',
      // user-level DSH install
      `${process.env.USERPROFILE}\\AppData\\Roaming\\npm\\dsh.cmd`,
    ]
    for (const c of candidates) {
      if (await exists(c)) {
        return { command: c, args: [] }
      }
    }
  }
  return null
}

function commandExists(cmd) {
  return new Promise((resolve) => {
    const finder = process.platform === 'win32' ? 'where' : 'which'
    const child = spawn(finder, [cmd], { stdio: 'ignore', windowsHide: true })
    child.on('error', () => resolve(false))
    child.on('exit', (code) => resolve(code === 0))
  })
}

function exists(p) {
  return new Promise((resolve) => access(p, (err) => resolve(!err)))
}
