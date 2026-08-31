/**
 * Syntax gate: `node --check` every JS file that ships in the package
 * (electron/ main-process modules + lib/ host/client bundle). Previously
 * only lib/index.js was checked — a syntax slip in any other file shipped
 * unnoticed.
 *
 * The two sandboxed preloads are CommonJS (require/module.exports) while
 * package.json declares "type": "module", so plain --check on them fails
 * spuriously; they are validated through a temporary .cjs copy instead.
 */
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync, rmSync, writeFileSync, mkdtempSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
// CJS files relative to electron/ — parsed as CommonJS despite the ESM package.
const CJS_FILES = new Set(['preload.js', 'progress-preload.js'])

function listJs(dir) {
  return readdirSync(join(root, dir)).filter((f) => f.endsWith('.js'))
}

const scratch = mkdtempSync(join(tmpdir(), 'dsh-shell-check-'))
let bad = 0
let checked = 0

try {
  for (const dir of ['electron', 'lib']) {
    for (const f of listJs(dir)) {
      const full = join(root, dir, f)
      if (!statSync(full).isFile()) continue
      const cjs = CJS_FILES.has(f)
      const target = cjs ? join(scratch, `${dir}-${f}.cjs`) : full
      if (cjs) writeFileSync(target, readFileSync(full))
      const r = spawnSync(process.execPath, ['--check', target], { stdio: 'pipe' })
      const ok = r.status === 0
      checked++
      if (!ok) {
        bad++
        console.log(`  FAIL ${dir}/${f}${cjs ? ' (checked as CJS)' : ''}`)
        if (r.stderr) console.error(r.stderr.toString().trim())
      } else {
        console.log(`  ok   ${dir}/${f}${cjs ? ' (checked as CJS)' : ''}`)
      }
    }
  }
} finally {
  rmSync(scratch, { recursive: true, force: true })
}

console.log(bad === 0 ? `PASS (${checked} files)` : `FAIL (${bad}/${checked} file(s))`)
process.exit(bad === 0 ? 0 : 1)
