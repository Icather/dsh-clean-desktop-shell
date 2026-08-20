/**
 * Shell config persistence (userData/config.json).
 *
 * Fields:
 *  - targetUrl:       default 'http://127.0.0.1:3080' — set to any remote
 *                     DSH address to run the shell as a pure window.
 *  - autoStartService: default true — only applies to the local default URL.
 *  - closeToTray:      default true.
 *  - windowMode:       'advanced' (mica/vibrancy) | 'compatibility'.
 *  - autoLaunch:       open at login.
 */
import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DEFAULTS = {
  targetUrl: 'http://127.0.0.1:3080',
  autoStartService: true,
  closeToTray: true,
  windowMode: 'advanced',
  autoLaunch: false,
  backendPath: null,
}

let cached = null

function configPath() {
  return join(app.getPath('userData'), 'config.json')
}

export function loadConfig() {
  if (cached) return cached
  try {
    const raw = readFileSync(configPath(), 'utf8')
    cached = { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    cached = { ...DEFAULTS }
  }
  return cached
}

export function saveConfig(next) {
  cached = { ...DEFAULTS, ...next }
  const file = configPath()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(cached, null, 2), 'utf8')
  return cached
}
