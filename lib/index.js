/**
 * dsh-clean-desktop-shell — host half (plugin loader entry).
 *
 * The desktop shell is an Electron client; the host half only registers
 * the plugin so it mounts cleanly into a dsh profile and exposes its
 * settings surface. Window material (Mica / vibrancy) lives in the
 * Electron main process (see src/main/).
 */
export function apply(ctx) {
  ctx.on('ready', () => {
    ctx.logger.info('[clean-desktop-shell] mounted (host half)')
  })
}
