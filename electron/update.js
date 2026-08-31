/**
 * Update handling — Windows auto-update, macOS manual download.
 *
 * Windows (packaged app): uses electron-updater to download the new
 * installer from GitHub Releases in the background and install it on
 * restart. Progress is shown in the small progress window.
 *
 * macOS / dev mode: falls back to a manual check that opens the GitHub
 * Releases page (macOS auto-update needs a Developer ID signature which
 * this project does not have yet).
 */
import { app, shell, dialog } from 'electron'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { showProgress, setProgress, closeProgress } from './progress.js'
import { loadConfig } from './config.js'

const REPO_URL = 'https://github.com/Icather/dsh-clean-desktop-shell'
const RELEASES_API = 'https://api.github.com/repos/Icather/dsh-clean-desktop-shell/releases/latest'
// npm registry — the update source for plugin (npm-installed) mode.
const NPM_REGISTRY_API = 'https://registry.npmjs.org/dsh-clean-desktop-shell'

// Plugin (bare-runtime) mode has no app bundle, so app.getVersion() returns
// the Electron runtime version (e.g. 33.4.11). Read the plugin's own version
// from its package.json instead.
const PKG_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const PKG_VERSION = (() => {
  try {
    return JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8')).version
  } catch {
    return null
  }
})()

let autoUpdater = null
let updaterPromise = null

/** Lazy-load electron-updater (CJS → ESM interop via dynamic import). */
function getAutoUpdater() {
  if (!updaterPromise) {
    updaterPromise = import('electron-updater').then((m) => m.autoUpdater)
  }
  return updaterPromise
}

/** Windows packaged apps can auto-update; everything else uses manual. */
export function isAutoUpdateSupported() {
  return process.platform === 'win32' && app.isPackaged
}

/** Wire the auto-updater events once (no-op on mac / dev mode). */
export function setupAutoUpdater() {
  if (!isAutoUpdateSupported()) return
  getAutoUpdater()
    .then((au) => {
      if (autoUpdater) return
      autoUpdater = au
      autoUpdater.autoDownload = true
      autoUpdater.autoInstallOnAppQuit = true

      autoUpdater.on('update-available', () => {
        showProgress({ title: '检查更新', message: '发现新版本，正在后台下载…' })
      })
      autoUpdater.on('download-progress', (p) => {
        const pct = Math.round(p.percent)
        setProgress({
          title: '检查更新',
          message: `正在下载更新：${pct}%`,
          state: pct >= 100 ? 'ok' : 'busy',
        })
      })
      autoUpdater.on('update-downloaded', () => {
        setProgress({ title: '检查更新', message: '更新已下载', state: 'ok' })
        setTimeout(() => {
          closeProgress()
          const choice = dialog.showMessageBoxSync({
            type: 'info',
            title: '更新已就绪',
            message: '新版本已下载完成，重启应用即可安装。',
            detail: '是否立即重启安装？',
            buttons: ['立即重启', '稍后'],
            defaultId: 0,
            cancelId: 1,
          })
          if (choice === 0) autoUpdater.quitAndInstall()
        }, 800)
      })
      autoUpdater.on('update-not-available', () => {
        closeProgress()
        dialog.showMessageBoxSync({
          type: 'info',
          title: '已是最新版本',
          message: '当前已是最新版本。',
        })
      })
      autoUpdater.on('error', (err) => {
        closeProgress()
        dialog.showMessageBoxSync({
          type: 'warning',
          title: '检查更新失败',
          message: `自动更新失败：${err?.message || '未知错误'}`,
          detail: '可前往 GitHub Releases 手动下载。',
        })
      })
    })
    .catch(() => {
      // electron-updater failed to load — auto-update silently disabled.
    })
}

/** Tray "check for update": auto flow on Windows, manual fallback elsewhere. */
export async function checkForUpdatesAuto() {
  if (isAutoUpdateSupported()) {
    try {
      await getAutoUpdater()
      await autoUpdater?.checkForUpdates()
    } catch (err) {
      closeProgress()
      dialog.showMessageBoxSync({
        type: 'warning',
        title: '检查更新失败',
        message: `自动更新失败：${err?.message || '未知错误'}`,
        detail: '可前往 GitHub Releases 手动下载。',
      })
    }
    return
  }

  // Manual path. Plugin mode is installed via npm/DSH market, so it checks the
  // npm registry; the packaged desktop app checks GitHub Releases.
  const isPlugin = !app.isPackaged
  const r = isPlugin ? await checkForUpdateNpm() : await checkForUpdate()
  if (r.hasUpdate) {
    const choice = dialog.showMessageBoxSync({
      type: 'info',
      title: '发现新版本',
      message: `当前版本 ${r.current}，最新版本 ${r.latest}。`,
      detail: isPlugin
        ? '插件形态请到 DSH 网页的「设置 → 插件市场 → 已安装」里点「更新」，完成后按提示重启即可生效。'
        : 'macOS 自动更新需要代码签名，当前请前往 GitHub Releases 手动下载。',
      buttons: isPlugin ? ['打开 DSH 网页', '稍后'] : ['前往下载', '取消'],
      defaultId: 0,
      cancelId: 1,
    })
    if (choice === 0) openUrl(isPlugin ? loadConfig().targetUrl : r.url)
  } else if (r.latest) {
    dialog.showMessageBoxSync({
      type: 'info',
      title: '已是最新版本',
      message: `当前版本 ${r.current} 已是最新。`,
    })
  } else {
    dialog.showMessageBoxSync({
      type: 'warning',
      title: '检查更新失败',
      message: isPlugin
        ? '无法连接 npm 检查更新，请检查网络后重试。'
        : '无法连接 GitHub 检查更新，请检查网络后重试。',
    })
  }
}

/** Parse "v1.2.3" / "1.2.3" → [1,2,3]; null when malformed. */
function parseVersion(v) {
  if (!v) return null
  const m = String(v).replace(/^v/i, '').trim().match(/^(\d+)\.(\d+)\.(\d+)/)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/**
 * Current app version. Packaged builds carry it in the exe; a bare runtime
 * (plugin mode) must read the plugin package.json — app.getVersion() would
 * report the Electron runtime version there.
 */
function currentVersion() {
  return app.isPackaged ? app.getVersion() : PKG_VERSION || app.getVersion()
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
 * Manual version check against the latest GitHub release (macOS path).
 * @returns {{ hasUpdate: boolean, latest?: string, current: string, url: string }}
 */
export async function checkForUpdate() {
  const current = currentVersion()
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

/**
 * Version check for plugin (npm-installed) mode. The plugin is updated through
 * the npm registry / DSH market, so its "latest" must come from npm — NOT from
 * GitHub Releases (that endpoint is only for the packaged desktop app).
 * @returns {{ hasUpdate: boolean, latest?: string, current: string, url: string }}
 */
export async function checkForUpdateNpm() {
  const current = currentVersion()
  let latestStr = null
  const url = 'https://www.npmjs.com/package/dsh-clean-desktop-shell'

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(NPM_REGISTRY_API, { signal: controller.signal })
    clearTimeout(timer)
    if (res.ok) {
      const data = await res.json()
      latestStr = data['dist-tags']?.latest || null
    }
  } catch {
    // Network error — no update known.
  }

  const currentV = parseVersion(current)
  const latestV = parseVersion(latestStr)
  return {
    hasUpdate: isNewer(latestV, currentV),
    latest: latestStr ? `v${latestStr}` : null,
    current,
    url,
  }
}
