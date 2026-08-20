import { app } from 'electron'

/**
 * AppUserModelID, shared by main (process-level), window (taskbar button)
 * and shortcut (Start-menu .lnk) so the three always agree.
 *
 * Why plugin mode gets its own ID: Windows caches the taskbar button icon
 * per AUMID. If the plugin shell reuses the installer's ID that ever ran
 * with Electron's default icon (an early dev launch / an old build), the
 * taskbar keeps showing that stale icon — no window `icon`, `setAppDetails`
 * or exe patch can override the cache. A distinct ID makes Windows treat it
 * as a brand-new app and re-read the icon. It also keeps the plugin shell
 * from merging with an installed copy on the same machine.
 */
export const APP_USER_MODEL_ID = app.isPackaged
  ? 'com.icather.dsh-clean-desktop-shell'
  : 'com.icather.dsh-clean-desktop-shell.plugin'
