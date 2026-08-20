/**
 * Preload: makes the frameless window draggable.
 *
 * A frameless window has no title bar, so dragging is provided by a
 * `-webkit-app-region: drag` strip along the top of the loaded page.
 * The right side is left for the native window-controls overlay.
 *
 * The strip is a transparent overlay, so it never changes page layout —
 * but it sits above the page top edge, so page top-bar buttons can be
 * reached by the strip being only 1px tall at the very edge... Instead we
 * use a pragmatic height and rely on the page's own top padding for the
 * DSH top bar area. Overlap is acceptable: the strip is click-through for
 * everything except dragging (app-region drag areas swallow mouse events).
 */
window.addEventListener('DOMContentLoaded', () => {
  const platform = process.platform
  const isWin = platform === 'win32'
  const dragHeight = isWin ? 32 : 28
  // Width reserved for native window controls (Win caption buttons / mac
  // traffic lights live at the top-right / top-left).
  const rightReserve = isWin ? 138 : 80
  const leftReserve = isWin ? 0 : 80

  const strip = document.createElement('div')
  strip.id = 'dsh-clean-shell-drag'
  strip.style.cssText = `
    position: fixed;
    top: 0;
    left: ${leftReserve}px;
    right: ${rightReserve}px;
    height: ${dragHeight}px;
    -webkit-app-region: drag;
    z-index: 2147483647;
  `
  document.body.appendChild(strip)
})
