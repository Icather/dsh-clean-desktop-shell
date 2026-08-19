#!/usr/bin/env node
// Minimal zero-dependency build: copies src → lib.
// Real bundling (tsdown/vite) lands with the Electron shell work.
import { cpSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
mkdirSync(join(root, 'lib'), { recursive: true })
cpSync(join(root, 'src', 'host', 'index.js'), join(root, 'lib', 'index.js'))
cpSync(join(root, 'src', 'client', 'client.js'), join(root, 'lib', 'client.js'))
console.log('[dsh-clean-desktop-shell] built lib/ from src/')
