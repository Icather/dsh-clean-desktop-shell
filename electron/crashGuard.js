/**
 * Crash guard — last-resort observability for the Electron main process.
 *
 * Unhandled errors used to vanish (a GUI process has no console), leaving
 * only "the window didn't come up". Mirror the host half's diagnostics
 * philosophy (reportLaunchFailure): append one entry per event to
 * userData/shell-crash.log so a user can attach something actionable to a
 * bug report.
 *
 * The log is capped: past 128 KB the oldest content is dropped, so a
 * repeating failure can never grow the file without bound.
 */
import { app } from 'electron'
import { appendFileSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const MAX_BYTES = 128 * 1024
const KEEP_BYTES = 32 * 1024

function crashLogFile() {
  return join(app.getPath('userData'), 'shell-crash.log')
}

/** Where the crash log lives (named in docs / bug-report guidance). */
export function crashLogPath() {
  return crashLogFile()
}

function append(entry) {
  try {
    const file = crashLogFile()
    try {
      if (statSync(file).size > MAX_BYTES) {
        // Cap: keep only the newest KEEP_BYTES when the log outgrows itself.
        const tail = readFileSync(file, 'utf8').slice(-KEEP_BYTES)
        writeFileSync(file, tail, 'utf8')
      }
    } catch {
      // First write (file missing) — nothing to cap.
    }
    appendFileSync(file, entry, 'utf8')
  } catch {
    // Nowhere left to report to — stay silent rather than crash the guard.
  }
}

/**
 * Install process-level handlers. Errors are logged and swallowed: for a
 * tray-resident shell, surviving one stray async rejection beats dying on
 * it — the process-level state after a handled uncaughtException is the
 * same "best effort" the shell already applies everywhere else.
 */
export function setupCrashGuard() {
  process.on('uncaughtException', (err) => {
    append(`[${new Date().toISOString()}] uncaughtException: ${err?.stack || err}\n`)
  })
  process.on('unhandledRejection', (reason) => {
    append(`[${new Date().toISOString()}] unhandledRejection: ${reason?.stack || reason}\n`)
  })
}
