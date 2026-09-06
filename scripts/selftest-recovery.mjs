/**
 * Self-check for the backend-outage run (electron/outage.js).
 *
 * Defends the phase-1 recovery transitions, not threshold constants alone:
 *  - consecutive probe failures escalate the in-page notice from transient
 *    to persistent/unavailable only after the agreed boundary, and a single
 *    success resets the run (a one-off slow response can never escalate a
 *    loaded session);
 *  - the navigation token discards probe results that finish after the
 *    window navigated or was disposed — a stale result (success or failure)
 *    must never mutate the run nor produce a notice payload.
 *
 * Run: node scripts/selftest-recovery.mjs
 * Electron additionally checks that a real failed spawn remains retryable.
 */
import { OutageRun, PERSISTENT_AFTER_FAILURES } from '../electron/outage.js'

let failures = 0

function check(label, cond) {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`)
  if (!cond) failures++
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

console.log('[escalation: transient → persistent → recovery]')
const run = new OutageRun()
check('a healthy probe yields the ok payload', same(run.apply(run.checkpoint(), true), { state: 'ok' }))
for (let i = 1; i < PERSISTENT_AFTER_FAILURES; i++) {
  const out = run.apply(run.checkpoint(), false)
  check(
    `failure ${i} stays transient (failures=${run.failures})`,
    same(out, { state: 'degraded', persistent: false }) && run.failures === i,
  )
}
const escalated = run.apply(run.checkpoint(), false)
check(
  `failure ${PERSISTENT_AFTER_FAILURES} escalates to persistent`,
  same(escalated, { state: 'degraded', persistent: true }) &&
    run.failures === PERSISTENT_AFTER_FAILURES,
)
check(
  'further failures stay persistent',
  same(run.apply(run.checkpoint(), false), { state: 'degraded', persistent: true }),
)
const recovered = run.apply(run.checkpoint(), true)
check('a success recovers and resets the run', same(recovered, { state: 'ok' }) && run.failures === 0)
check(
  'a failure after recovery is transient again',
  same(run.apply(run.checkpoint(), false), { state: 'degraded', persistent: false }) &&
    run.failures === 1,
)

console.log('[stale results after navigation are discarded]')
const run2 = new OutageRun()
const t1 = run2.checkpoint()
const t2 = run2.checkpoint()
check('checkpoints stay valid while no navigation happens', run2.isCurrent(t1) && run2.isCurrent(t2))
run2.apply(t1, false)
run2.reset() // e.g. showOffline / reload / fresh page load
check('reset invalidates outstanding checkpoints', !run2.isCurrent(t1) && !run2.isCurrent(t2))
check('a stale failure result is discarded (no payload)', run2.apply(t1, false) === null)
check('a stale success result is discarded too', run2.apply(t2, true) === null)
check('discards did not mutate the fresh run', run2.failures === 0)
check(
  'a fresh probe after the reset starts over at failure 1',
  same(run2.apply(run2.checkpoint(), false), { state: 'degraded', persistent: false }) &&
    run2.failures === 1,
)

if (process.versions.electron) {
  const { default: assert } = await import('node:assert/strict')
  const { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const service = await import('../electron/service.js')
  const folder = mkdtempSync(join(tmpdir(), 'dsh-failed-spawn-'))
  const command = join(folder, 'dsh')
  const fetch = globalThis.fetch
  // Keep the probe isolated from any real backend; process spawning stays real.
  globalThis.fetch = async () => { throw new Error('isolated unreachable backend') }
  try {
    writeFileSync(command, 'not an executable', { mode: 0o600 })
    await assert.rejects(service.start({ backendPath: folder }))
    await assert.rejects(service.start({ backendPath: folder }))
    check('a failed spawn rejects again instead of reporting a live backend', true)
  } catch (error) {
    console.error(error)
    check('a failed spawn rejects again instead of reporting a live backend', false)
  } finally {
    globalThis.fetch = fetch
    unlinkSync(command)
    rmdirSync(folder)
  }

  const { app, ipcMain } = await import('electron')
  const { createServer } = await import('node:http')
  const { once } = await import('node:events')
  const { createMainWindow } = await import('../electron/window.js')
  const server = createServer((_request, response) => response.end('<!doctype html><title>Recovery check</title>'))
  app.whenReady().then(async () => {
    let window
    try {
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
      window = createMainWindow({ target: `http://127.0.0.1:${server.address().port}/?dsh-desktop-mode=advanced` })
      window.hide()
      await once(window.webContents, 'did-finish-load')
      await window.webContents.executeJavaScript(`
        window.attempts = 0
        window.shellAPI.onReconnectRequest(() => {
          if (++window.attempts > 5) return
          window.shellAPI.connectionReport('connecting')
          window.shellAPI.connectionReport('disconnected')
        })
        window.shellAPI.connectionReport('disconnected')
      `)
      for (let i = 0; i < 5; i++) ipcMain.emit('shell:retry-connection', { sender: window.webContents })
      await new Promise(resolve => setTimeout(resolve, 500))
      assert.equal(await window.webContents.executeJavaScript('window.attempts'), 1)
      check('burst retries share one attempt and immediate failure does not feed back', true)
    } catch (error) {
      console.error(error)
      check('burst retries share one attempt and immediate failure does not feed back', false)
    } finally {
      window?.destroy()
      server.close()
    }
    finish()
  })
}

function finish() {
  console.log(`\n${failures === 0 ? 'PASS' : `FAIL (${failures} check(s))`}`)
  process.exit(failures === 0 ? 0 : 1)
}

if (!process.versions.electron) finish()
