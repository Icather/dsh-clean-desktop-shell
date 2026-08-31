/**
 * Shell config persistence (userData/config.json).
 *
 * Fields:
 *  - targetUrl:    DEFAULT_TARGET_URL — set to any remote DSH address to
 *                  run the shell as a pure window.
 *  - closeToTray:  default true.
 *  - backendPath:  folder containing the dsh CLI (tray "set backend folder").
 *  - shortcutAsked: true once the first-run shortcut prompt was shown.
 *
 * Persistence is atomic (tmp file + rename) and load-time type-checked, so
 * a crash mid-write or a hand-edited file can never poison the shell.
 */
import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'

// Single source of truth for the local dsh web endpoint. Every module that
// needs the default URL or its port imports it from here — no duplicated
// literals.
export const DEFAULT_TARGET_URL = 'http://127.0.0.1:3080'

const DEFAULTS = {
  targetUrl: DEFAULT_TARGET_URL,
  closeToTray: true,
  backendPath: null,
  // True once the first-run "create a desktop shortcut?" prompt was shown
  // (so it never nags again). The tray item stays available regardless.
  shortcutAsked: false,
}

let cached = null

function configPath() {
  return join(app.getPath('userData'), 'config.json')
}

export function loadConfig() {
  if (cached) return cached
  try {
    const parsed = JSON.parse(readFileSync(configPath(), 'utf8'))
    // Keep only known fields with expected types — unknown/legacy keys
    // (e.g. the never-wired `windowMode`) are dropped on the next save.
    cached = { ...DEFAULTS }
    if (typeof parsed.targetUrl === 'string' && parsed.targetUrl) cached.targetUrl = parsed.targetUrl
    if (typeof parsed.closeToTray === 'boolean') cached.closeToTray = parsed.closeToTray
    if (typeof parsed.backendPath === 'string' || parsed.backendPath === null) cached.backendPath = parsed.backendPath
    if (typeof parsed.shortcutAsked === 'boolean') cached.shortcutAsked = parsed.shortcutAsked
  } catch {
    cached = { ...DEFAULTS }
  }
  return cached
}

export function saveConfig(next) {
  cached = { ...DEFAULTS, ...next }
  const file = configPath()
  mkdirSync(dirname(file), { recursive: true })
  // Atomic persistence: write a sibling tmp file, then rename over the real
  // one (rename is atomic within a volume). A crash mid-write leaves the
  // old config intact instead of a truncated file.
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(cached, null, 2), 'utf8')
  try {
    renameSync(tmp, file)
  } catch {
    // Windows rename can briefly fail with EPERM/EBUSY (AV scan) — drop the
    // target and retry; fall back to a non-atomic write as a last resort.
    try {
      rmSync(file, { force: true })
      renameSync(tmp, file)
    } catch {
      writeFileSync(file, JSON.stringify(cached, null, 2), 'utf8')
    }
  }
  return cached
}
