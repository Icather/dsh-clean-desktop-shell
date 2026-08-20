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
import { showProgress, setProgress, closeProgress } from './progress.js'

const REPO_URL = 'https://github.com/Icather/dsh-clean-desktop-shell'
const RELEASES_API = 'https://api.github.com/repos/Icather/dsh-clean-desktop-shell/releases/latest'

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

  // Manual path (macOS / dev mode): compare versions, offer GitHub page.
  const r = await checkForUpdate()
  if (r.hasUpdate) {
    const choice = dialog.showMessageBoxSync({
      type: 'info',
      title: '发现新版本',
      message: `当前版本 ${r.current}，最新版本 ${r.latest}。`,
      detail: 'macOS 自动更新需要代码签名，当前请前往 GitHub Releases 手动下载。',
      buttons: ['前往下载', '取消'],
      defaultId: 0,
      cancelId: 1,
    })
    if (choice === 0) openUrl(r.url)
  } else if (r.latest) {
    dialog.showMessageBoxSync({
      type: 'info',
      title: '已是最新版本',
      message: `当前版本 ${r.current} 已是最新（${r.latest}）。`,
    })
  } else {
    dialog.showMessageBoxSync({
      type: 'warning',
      title: '检查更新失败',
      message: '无法连接 GitHub 检查更新，请检查网络后重试。',
    })
  }
}

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
 * Manual version check against the latest GitHub release (macOS path).
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
