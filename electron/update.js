/**
 * Version check and repo links.
 *
 * Checks the latest GitHub release of dsh-clean-desktop-shell against the
 * local app version (from app.getVersion()). Network failures are treated
 * as "no update" — never block or error in the tray.
 */
import { app, shell } from 'electron'

const REPO_URL = 'https://github.com/Icather/dsh-clean-desktop-shell'
const RELEASES_API = 'https://api.github.com/repos/Icather/dsh-clean-desktop-shell/releases/latest'

/** Parse "v1.2.3" / "1.2.3" → [1,2,3]; null when malformed. */
function parseVersion(v) {
  if (!v) return null
  const m = String(v).replace(/^v/i, '').trim().match(/^(\d+)\.(\d+)\.(\d+)/)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/** True when a is strictly newer than b. */
function isNewer(a, b) {
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i]
  }
  return false
}

/**
 * Check for a newer release.
 * @returns {{ hasUpdate: boolean, latest?: string, current: string, url: string }}
 */
export async function checkForUpdate() {
  const current = app.getVersion()
  let latest = null
  let tag = null
  let url = REPO_URL

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(RELEASES_API, {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json' },
    })
    clearTimeout(timer)
    if (res.ok) {
      const data = await res.json()
      tag = data.tag_name || null
      latest = parseVersion(tag)
      if (data.html_url) url = data.html_url
    }
  } catch {
    // Network error — no update known.
  }

  const currentV = parseVersion(current)
  return {
    hasUpdate: isNewer(latest, currentV),
    latest: tag,
    current,
    url,
  }
}

/** Open the repository homepage in the default browser. */
export function openRepo() {
  shell.openExternal(REPO_URL)
}

/** Open an arbitrary URL in the default browser. */
export function openUrl(url) {
  shell.openExternal(url)
}
