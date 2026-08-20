#!/usr/bin/env node
// Minimal zero-dependency build: copies src → lib.
// Real bundling (tsdown/vite) lands with the Electron shell work.
//
// Uses read+write (not cpSync/rmSync): Windows cpSync fails to overwrite
// existing files, and the sandbox's safe-delete shim intercepts rmSync.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
mkdirSync(join(root, 'lib'), { recursive: true })

const pairs = [
  ['src/host/index.js', 'lib/index.js'],
  ['src/host/common.js', 'lib/common.js'],
  ['src/host/runtime.js', 'lib/runtime.js'],
  ['src/host/icon.js', 'lib/icon.js'],
  ['src/client/client.js', 'lib/client.js'],
]
for (const [src, dest] of pairs) {
  writeFileSync(join(root, dest), readFileSync(join(root, src)))
}
console.log('[dsh-clean-desktop-shell] built lib/ from src/')
