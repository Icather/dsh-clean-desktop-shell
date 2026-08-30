/**
 * Self-check for the Electron runtime path logic.
 *
 * Guards the macOS launch bug: Electron's three archives have three
 * different layouts, and only darwin ships an app bundle with no top-level
 * binary. This fakes each platform and each archive layout, then asserts
 * join(versionDir, EXE_RELPATH) resolves to a real file — the exact
 * condition ensureRuntime() checks before spawning the shell.
 *
 * Run: node scripts/selftest-runtime.mjs
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

// Layouts as Electron actually ships them (authoritative mapping lives in
// the `electron` package's own install.js, which writes path.txt):
//   win32  → <dir>/electron.exe
//   linux  → <dir>/electron
//   darwin → <dir>/Electron.app/Contents/MacOS/Electron
const LAYOUTS = {
  win32: ['electron.exe', 'resources/placeholder'],
  linux: ['electron', 'resources/placeholder'],
  darwin: [
    'Electron.app/Contents/MacOS/Electron',
    'Electron.app/Contents/Info.plist',
  ],
}

let failures = 0

function check(label, cond) {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`)
  if (!cond) failures++
}

/** Materialise an extracted-archive tree under dir. */
function buildLayout(dir, entries) {
  for (const rel of entries) {
    const full = join(dir, ...rel.split('/').map((s) => s.split('\\').join(sep)))
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, 'binary')
  }
}

async function forPlatform(platform) {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
  // Cache-bust so the module re-evaluates its platform-derived constants.
  const { EXE_RELPATH, EXE_TOP } = await import(
    `${pathToFileURL(join(process.cwd(), 'lib', 'common.js')).href}?p=${platform}`
  )

  const root = mkdtempSync(join(tmpdir(), `dsh-shell-${platform}-`))
  const dir = join(root, 'electron-v33.4.11')
  console.log(`\n[${platform}]`)
  try {
    buildLayout(dir, LAYOUTS[platform])
    const exe = join(dir, EXE_RELPATH)

    check(`EXE_TOP = ${EXE_TOP}`, typeof EXE_TOP === 'string' && EXE_TOP.length > 0)
    check(`binary resolves: ${EXE_RELPATH}`, existsSync(exe))
    check('resolved path lives inside the version dir', exe.startsWith(dir))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

// Regression guard: prove the pre-fix constant was broken on darwin, so this
// test would actually have caught the bug rather than just passing forever.
async function regression() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-shell-legacy-'))
  const dir = join(root, 'electron-v33.4.11')
  console.log('\n[regression: pre-fix darwin behaviour]')
  try {
    buildLayout(dir, LAYOUTS.darwin)
    const legacyExe = 'electron' // what EXE_NAME used to be on every non-Windows platform
    check(`legacy join(dir, 'electron') is absent — the bug`, !existsSync(join(dir, legacyExe)))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

await regression()
for (const p of ['win32', 'linux', 'darwin']) {
  await forPlatform(p)
}

console.log(`\n${failures === 0 ? 'PASS' : `FAIL (${failures} check(s))`}`)
process.exit(failures === 0 ? 0 : 1)
