/**
 * Update handling — three install forms, three update sources.
 *
 * Windows (packaged app): uses electron-updater to download the new
 * installer from GitHub Releases in the background and install it on
 * restart. Progress is shown in the small progress window.
 *
 * macOS (packaged app): manual check that opens the GitHub Releases page
 * (macOS auto-update needs a Developer ID signature which this project
 * does not have yet).
 *
 * Plugin mode (npm-installed, !app.isPackaged): checks the npm registry for
 * dist-tags.latest and offers a one-click update executed through the
 * package manager that actually installed the plugin (inferred from the
 * lockfile next to the install, vercel-style), with command variants to
 * absorb environment and pnpm-version differences.
 */
import { app, shell, dialog } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { basename, dirname, join } from 'node:path'
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
const PKG_INFO = (() => {
  try {
    return JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'))
  } catch {
    return null
  }
})()
const PKG_VERSION = PKG_INFO?.version ?? null
// Read from the plugin's own manifest — never hardcode the package name.
const PKG_NAME = PKG_INFO?.name ?? 'dsh-clean-desktop-shell'

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
    if (!isPlugin) {
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
      return
    }

    // Plugin mode (Plan B + A): offer a one-click update executed through the
    // package manager that actually installed this package, and show the
    // equivalent manual command plus the DSH market path.
    const plan = detectPluginUpdatePlan()
    const variants = plan ? updateCommandVariants(plan.pm) : []
    const cmdLine = variants[0] || null
    const marketHint = '① DSH 网页「设置 → 插件市场 → 已安装」→「更新」（完成后按提示重启）。'
    const detail = cmdLine
      ? `${marketHint}\n② 或在目录 ${plan.profileRoot} 下执行：\n${cmdLine}\n（按 Ctrl+C 可复制本对话框全部文字）`
      : marketHint
    const choice = dialog.showMessageBoxSync({
      type: 'info',
      title: '发现新版本',
      message: `当前版本 ${r.current}，最新版本 ${r.latest}。`,
      detail,
      buttons: cmdLine ? ['立即更新', '打开 DSH 网页', '稍后'] : ['打开 DSH 网页', '稍后'],
      defaultId: 0,
      cancelId: cmdLine ? 2 : 1,
    })
    if (cmdLine && choice === 0) {
      await updatePluginViaPackageManager(plan, variants, r)
    } else if (choice === (cmdLine ? 1 : 0)) {
      openUrl(loadConfig().targetUrl)
    }
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

/**
 * Locate the directory whose package.json declares this plugin as a dependency
 * (the DSH profile root: <root>/node_modules/<pkg>), and infer the package
 * manager that manages it from the lockfile found there (vercel-style).
 * @returns {{ pm: 'pnpm'|'npm'|'yarn'|'bun', profileRoot: string } | null}
 */
function detectPluginUpdatePlan() {
  try {
    const nm = dirname(PKG_ROOT)
    if (basename(nm) !== 'node_modules') return null
    const profileRoot = dirname(nm)
    if (!existsSync(join(profileRoot, 'package.json'))) return null
    const pm = existsSync(join(profileRoot, 'pnpm-lock.yaml')) ? 'pnpm'
      : existsSync(join(profileRoot, 'package-lock.json')) ? 'npm'
      : existsSync(join(profileRoot, 'yarn.lock')) ? 'yarn'
      : (existsSync(join(profileRoot, 'bun.lockb')) || existsSync(join(profileRoot, 'bun.lock'))) ? 'bun'
      : null
    return pm ? { pm, profileRoot } : null
  } catch {
    return null
  }
}

/**
 * Command candidates for the detected package manager, ordered from the most
 * explicit to the most tolerant. Environment differences (pnpm only reachable
 * via corepack) and pnpm version/flag differences are absorbed by trying them
 * in order — the first variant that exits 0 wins. Quoting via JSON.stringify
 * keeps paths/args safe in cmd.exe, PowerShell and POSIX shells alike.
 */
function updateCommandVariants(pm) {
  const q = JSON.stringify(PKG_NAME)
  switch (pm) {
    case 'pnpm':
      return [
        `pnpm update ${q} --latest --config.minimumReleaseAge=0`,
        `pnpm update ${q} --latest`,
        `pnpm update ${q}`,
        `corepack pnpm update ${q} --latest`,
      ]
    case 'npm':
      return [`npm install ${q}@latest`]
    case 'yarn':
      return [`yarn up ${q}@latest`, `yarn upgrade ${q} --latest`]
    case 'bun':
      return [`bun update ${q}`, `bun add ${q}@latest`]
    default:
      return []
  }
}

/**
 * Run a shell command, capturing tail output. Node's spawn with shell:true
 * always uses cmd.exe on Windows (regardless of the user's login shell being
 * PowerShell or cmd), which is also required for .cmd shims like pnpm — a
 * bare spawn would throw EINVAL. Resolves { ok, out, err }.
 */
function runShell(cmd, cwd, timeoutMs = 5 * 60 * 1000) {
  return new Promise((resolve) => {
    let out = ''
    let err = ''
    let settled = false
    const child = spawn(cmd, {
      cwd,
      shell: true,
      windowsHide: true, // no console flash from the GUI process
    })
    const timer = setTimeout(() => {
      if (!settled) child.kill()
    }, timeoutMs)
    child.stdout?.on('data', (d) => { out += d })
    child.stderr?.on('data', (d) => { err += d })
    child.on('error', () => {
      settled = true
      clearTimeout(timer)
      resolve({ ok: false, out: tail(out), err: tail(err) })
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ ok: code === 0, out: tail(out), err: tail(err) })
    })
  })
}

function tail(s, n = 4000) {
  return s.length > n ? s.slice(-n) : s
}

/** Read the currently installed plugin version from disk (post-update check). */
function installedPluginVersion() {
  try {
    return JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8')).version || null
  } catch {
    return null
  }
}

/**
 * One-click plugin update: try each command variant until one exits 0, then
 * verify the on-disk version actually changed. Three outcomes — success,
 * "ran but version unchanged" (constraint/cooldown), or failure with the
 * attempted commands and output tail for manual retry.
 */
async function updatePluginViaPackageManager(plan, variants, check) {
  showProgress({ title: '插件更新', message: `正在通过 ${plan.pm} 更新插件…` })
  let result = null
  for (const cmd of variants) {
    setProgress({ title: '插件更新', message: `正在执行：${cmd}`, state: 'busy' })
    result = await runShell(cmd, plan.profileRoot)
    if (result.ok) break
  }
  closeProgress()

  const newVer = installedPluginVersion()
  if (result?.ok && newVer && newVer !== check.current) {
    dialog.showMessageBoxSync({
      type: 'info',
      title: '更新完成',
      message: `插件已更新到 ${newVer}。`,
      detail: '重启 dsh web 后生效（可从本应用托盘菜单重启后端）。',
    })
    return
  }
  if (result?.ok) {
    dialog.showMessageBoxSync({
      type: 'warning',
      title: '版本未变化',
      message: `命令执行成功，但插件版本仍为 ${check.current}。`,
      detail: '可能被 package.json 的版本约束或新版本冷却策略限制，可稍后重试，或到 DSH 插件市场更新。',
    })
    return
  }
  const logTail = [result?.out, result?.err].filter(Boolean).join('\n').trim()
  dialog.showMessageBoxSync({
    type: 'warning',
    title: '自动更新失败',
    message: '无法自动更新插件，请手动执行或到 DSH 插件市场更新。',
    detail: [
      `已依次尝试：\n${variants.join('\n')}`,
      logTail ? `命令输出（末尾）：\n${logTail}` : '',
      `手动命令（在目录 ${plan.profileRoot} 下）：\n${variants[0]}`,
      '按 Ctrl+C 可复制本对话框全部文字。',
    ].filter(Boolean).join('\n\n'),
  })
}
