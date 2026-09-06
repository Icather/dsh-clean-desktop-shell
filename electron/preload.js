/**
 * Preload: makes the frameless window draggable + exposes the minimal
 * shell API to the loaded page (sandbox-safe contextBridge).
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
 *
 * The in-page connection notice is the non-destructive counterpart of the
 * offline screen: while a real page is loaded, backend liveness failures
 * never navigate away — the main process pushes watch results here and we
 * show/clear a small fixed banner instead. Draft, scroll and selection in
 * the loaded page are untouched.
 */
const { contextBridge, ipcRenderer } = require('electron')

// Page-side handler invoked when the main process asks the DSH client
// runtime (injected page module, src/client/client.js) to reconnect. One
// handler per page context — navigation resets it with the page.
let reconnectHandler = null

ipcRenderer.on('shell:client-reconnect', () => {
  try {
    if (typeof reconnectHandler === 'function') reconnectHandler()
  } catch {
    // page handler errors must not break the shell
  }
})

contextBridge.exposeInMainWorld('shellAPI', {
  // Ask the main process to (re)load the real target URL. Used by the
  // offline screen's retry button.
  reload: () => ipcRenderer.send('shell:reload'),
  // Offline-screen quick actions (mirror the tray backend controls).
  startBackend: () => ipcRenderer.send('shell:start-backend'),
  detectBackend: () => ipcRenderer.send('shell:detect-backend'),
  chooseBackendFolder: () => ipcRenderer.send('shell:choose-backend-folder'),
  // DSH client-runtime connection bridge (see src/client/client.js):
  // - connectionReport(state) forwards the page connection lifecycle
  //   ('connected' | 'connecting' | 'disconnected') to the main process so
  //   HTTP health alone can never hide a terminal disconnect;
  // - onReconnectRequest(cb) registers the page-side reconnect action (the
  //   runtime's own reconnect(), never a page reload); returns an
  //   unregister function.
  connectionReport: (state) => ipcRenderer.send('shell:client-connection', state),
  onReconnectRequest: (cb) => {
    if (typeof cb !== 'function') return () => {}
    reconnectHandler = cb
    return () => {
      if (reconnectHandler === cb) reconnectHandler = null
    }
  },
})

// ---------- in-page connection notice ----------

// Latest push from window.js refreshNotice: { state: 'ok' } or
// { state: 'degraded', persistent: boolean }, computed from merged HTTP
// probe + client-runtime connection state. Kept until the DOM is ready
// (messages can arrive before DOMContentLoaded on very fast loads).
let connState = null
let connUi = null

ipcRenderer.on('shell:connection-state', (_event, state) => {
  connState = state
  applyConnState()
})

function applyConnState() {
  if (!connState || !connUi) return
  if (!connState.state || connState.state === 'ok') {
    connUi.el.style.display = 'none'
    return
  }
  const persistent = connState.persistent === true
  connUi.title.textContent = persistent
    ? '后端暂时无法访问'
    : '与后端的连接暂时中断'
  connUi.sub.textContent = persistent
    ? '当前页面已保留，连接恢复后本页会自动继续，也可手动重试。'
    : '正在自动重连，当前页面已保留。'
  connUi.retryBtn.hidden = false
  // Full reload is only offered once the outage is persistent: it is
  // destructive to unsaved page state, so it stays an explicit user choice.
  connUi.reloadBtn.hidden = !persistent
  connUi.el.style.display = 'flex'
}

/**
 * Build the notice banner below the drag strip (top-center, fixed). Uses
 * inline styles like the drag strip — no <style> injection, so the loaded
 * page's Content-Security-Policy cannot block it. The element itself is
 * inert while hidden and never steals focus while visible.
 */
function buildConnUi() {
  const base = {
    position: 'fixed',
    top: '0',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'none',
    alignItems: 'center',
    gap: '14px',
    maxWidth: '76vw',
    padding: '8px 14px',
    background: 'rgba(16, 19, 26, 0.94)',
    border: '1px solid #33405a',
    borderRadius: '10px',
    color: '#e8eaf0',
    font: '13px/1.4 system-ui, "Segoe UI", "Microsoft YaHei", sans-serif',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
    zIndex: '2147483646',
    pointerEvents: 'auto',
    userSelect: 'none',
    WebkitUserSelect: 'none',
  }
  const el = document.createElement('div')
  el.id = 'dsh-clean-shell-conn'
  el.setAttribute('role', 'status')
  el.setAttribute('aria-live', 'polite')
  Object.assign(el.style, base)

  const copy = document.createElement('div')
  copy.style.display = 'flex'
  copy.style.flexDirection = 'column'
  copy.style.gap = '2px'

  const title = document.createElement('div')
  title.id = 'dsh-clean-shell-conn-title'
  title.style.fontWeight = '600'
  title.style.color = '#e8eaf0'
  const sub = document.createElement('div')
  sub.id = 'dsh-clean-shell-conn-sub'
  sub.style.fontSize = '12px'
  sub.style.opacity = '0.75'
  copy.append(title, sub)

  const actions = document.createElement('div')
  actions.style.display = 'flex'
  actions.style.gap = '8px'

  const btnStyle = {
    padding: '5px 12px',
    fontSize: '12px',
    color: '#e8eaf0',
    background: '#232d3d',
    border: '1px solid #33405a',
    borderRadius: '7px',
    cursor: 'pointer',
  }

  const retryBtn = document.createElement('button')
  retryBtn.id = 'dsh-clean-shell-conn-retry'
  retryBtn.type = 'button'
  retryBtn.textContent = '立即重试'
  Object.assign(retryBtn.style, btnStyle)
  retryBtn.addEventListener('mouseenter', () => { retryBtn.style.background = '#2b3750' })
  retryBtn.addEventListener('mouseleave', () => { retryBtn.style.background = '#232d3d' })
  retryBtn.addEventListener('click', () => ipcRenderer.send('shell:retry-connection'))

  const reloadBtn = document.createElement('button')
  reloadBtn.id = 'dsh-clean-shell-conn-reload'
  reloadBtn.type = 'button'
  reloadBtn.textContent = '重新加载页面'
  Object.assign(reloadBtn.style, btnStyle)
  reloadBtn.hidden = true
  reloadBtn.addEventListener('mouseenter', () => { reloadBtn.style.background = '#2b3750' })
  reloadBtn.addEventListener('mouseleave', () => { reloadBtn.style.background = '#232d3d' })
  reloadBtn.addEventListener('click', () => ipcRenderer.send('shell:reload'))

  actions.append(retryBtn, reloadBtn)
  el.append(copy, actions)
  return { el, title, sub, retryBtn, reloadBtn }
}

window.addEventListener('DOMContentLoaded', () => {
  const platform = process.platform
  const isWin = platform === 'win32'
  // macOS: 12px (was 28). The DSH web UI's own top toolbar starts ~16px
  // from the window top and does NOT consume dsh-desktop-titlebar-inset,
  // so a 28px strip swallowed the upper half of every toolbar control —
  // clicks had to aim low. 12px stays above that padding (drag-only band)
  // while better-sidebar keeps yielding 28px for the traffic lights.
  const dragHeight = isWin ? 32 : 12
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

  connUi = buildConnUi()
  // Clear the drag band so the banner is clickable, then render any state
  // pushed before the DOM was ready.
  connUi.el.style.top = `${dragHeight + 10}px`
  document.body.appendChild(connUi.el)
  applyConnState()
})
