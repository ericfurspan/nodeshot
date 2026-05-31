// scripts/build.mjs
//
// Builds each extension entry (background, content, preview) in ISOLATION — one
// Vite/Rolldown build per entry, each with a single input.
//
// Why not one multi-entry build? Vite 8's bundler (Rolldown) extracts code shared
// across entries — including the generic CommonJS-interop runtime helpers pulled in
// by html2canvas (content) and pdf-lib (preview) — into a shared chunk, and rewrites
// the entries to `import` it. But every NodeShot entry is loaded as a CLASSIC script:
//   - content.js  — injected via chrome.scripting.executeScript (not an ES module)
//   - preview.js  — <script src="./preview.js"> in preview.html (no type=module)
//   - background.js — MV3 service worker, not declared as a module
// A cross-chunk `import` statement in any of them is a fatal syntax error. Building
// each entry alone gives Rolldown nothing to share, so all helpers inline and no
// chunk is emitted — reproducing the self-contained entries Vite 5 produced.

import { build } from 'vite'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { copyFileSync, mkdirSync, cpSync, rmSync } from 'node:fs'
import { sharedOutput } from '../vite.config.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const watch = process.argv.includes('--watch')

const ENTRIES = {
  background: 'src/background.js',
  content: 'src/content.js',
  preview: 'src/preview.js',
}

// Copies the static (non-bundled) assets into dist. Runs after each entry build via
// closeBundle so it also re-copies on every rebuild in watch mode.
function copyStaticAssets() {
  return {
    name: 'copy-static',
    closeBundle() {
      copyFileSync(resolve(root, 'manifest.json'), resolve(root, 'dist/manifest.json'))
      copyFileSync(resolve(root, 'src/preview.html'), resolve(root, 'dist/preview.html'))
      mkdirSync(resolve(root, 'dist/assets'), { recursive: true })
      cpSync(resolve(root, 'src/assets'), resolve(root, 'dist/assets'), { recursive: true })
    },
  }
}

// Clean dist once up front; each per-entry build then appends to it.
rmSync(resolve(root, 'dist'), { recursive: true, force: true })

for (const [name, input] of Object.entries(ENTRIES)) {
  await build({
    root,
    configFile: false, // build options live here, not in vite.config.js
    plugins: [copyStaticAssets()],
    build: {
      outDir: 'dist',
      emptyOutDir: false, // dist was cleaned once above; keep earlier entries
      sourcemap: false,
      rollupOptions: {
        input: { [name]: resolve(root, input) },
        output: sharedOutput,
      },
      watch: watch ? {} : null,
    },
  })
}
