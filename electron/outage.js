/**
 * Per-window backend-outage run (liveness-watch state).
 *
 * Pure module — no Electron imports — so the recovery self-test
 * (scripts/selftest-recovery.mjs) can exercise the real transitions under
 * plain node: consecutive-failure escalation, reset-on-recovery, and the
 * navigation token that discards probe results which finished after the
 * window navigated away or was disposed.
 */

// An outage escalates from transient to persistent/unavailable copy after
// this many consecutive failed probes (~3 × 4s watch interval).
export const PERSISTENT_AFTER_FAILURES = 3

export class OutageRun {
  constructor() {
    this.failures = 0
    // Navigation epoch. reset() bumps it; every async probe captures a
    // checkpoint() before awaiting and apply() discards the result if the
    // epoch moved meanwhile — a stale probe can never act on a newer
    // navigation (or on a disposed window's fresh lookalike state).
    this.epoch = 0
  }

  /** Capture the current epoch before starting an async probe. */
  checkpoint() {
    return this.epoch
  }

  /** True while the run is still on the navigation `token` was taken under. */
  isCurrent(token) {
    return token === this.epoch
  }

  /** Navigation/flip (or fresh page load): invalidate in-flight probes and start a fresh run. */
  reset() {
    this.epoch += 1
    this.failures = 0
  }

  /**
   * Apply a probe result taken under `token`. Returns null when the run was
   * reset (the window navigated away or was disposed) while the probe was in
   * flight — the result is stale and must not act. Otherwise advances the
   * consecutive-failure counter and returns the exact renderer payload for
   * the in-page connection notice (window.js sends it verbatim).
   */
  apply(token, up) {
    if (!this.isCurrent(token)) return null
    if (up) {
      this.failures = 0
      return { state: 'ok' }
    }
    this.failures += 1
    return {
      state: 'degraded',
      persistent: this.failures >= PERSISTENT_AFTER_FAILURES,
    }
  }
}
