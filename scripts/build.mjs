// scripts/build.mjs
//
// Builds the extension entries (background, content) and copies the static assets
// into dist/, then asserts that every emitted entry is a valid CLASSIC script.
//
// Why the assertion: every NodeShot entry is loaded as a classic script —
//   - content.js    — injected via chrome.scripting.executeScript (not an ES module)
//   - background.js — MV3 service worker, not declared as a module
// so an `import`/`export` statement in either is a fatal syntax error at load time.
// Vite 8's bundler (Rolldown) extracts code shared across entries into a chunk and
// rewrites the entries to `import` it, which is exactly what must not happen here.
// Nothing is shared between these two entries today (html2canvas is content-only),
// so no chunk is emitted — but that is a property of the current dependency graph,
// not a guarantee. assertClassicScripts() turns it into one: add a dependency both
// entries pull in and the build fails here rather than at extension load.

import { build } from 'vite'
import { Script } from 'node:vm'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { copyFileSync, mkdirSync, cpSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { sharedOutput } from '../vite.config.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const watch = process.argv.includes('--watch')

const ENTRIES = {
  background: 'src/background.js',
  content: 'src/content.js',
}

// Copies the static (non-bundled) assets into dist. Runs via closeBundle so it also
// re-copies on every rebuild in watch mode.
function copyStaticAssets() {
  return {
    name: 'copy-static',
    closeBundle() {
      copyFileSync(resolve(root, 'manifest.json'), resolve(root, 'dist/manifest.json'))
      mkdirSync(resolve(root, 'dist/assets'), { recursive: true })
      cpSync(resolve(root, 'src/assets'), resolve(root, 'dist/assets'), { recursive: true })
    },
  }
}

// Compiles each entry the way Chrome will load it. new Script() parses as a classic
// script without running it, so an `import`/`export` statement throws SyntaxError
// here instead of at extension load. Also fails if a shared chunk was emitted at all.
function assertClassicScripts() {
  const chunks = resolve(root, 'dist/chunks')
  if (existsSync(chunks)) {
    throw new Error('Build emitted dist/chunks/ — entries would import from it; classic scripts cannot.')
  }
  for (const name of Object.keys(ENTRIES)) {
    const file = resolve(root, `dist/${name}.js`)
    try {
      new Script(readFileSync(file, 'utf8'), { filename: file })
    } catch (err) {
      throw new Error(`dist/${name}.js is not a valid classic script: ${err.message}`)
    }
  }
  console.log(`✓ classic-script check passed (${Object.keys(ENTRIES).join(', ')})`)
}

rmSync(resolve(root, 'dist'), { recursive: true, force: true })

await build({
  root,
  configFile: false, // build options live here, not in vite.config.js
  plugins: [copyStaticAssets()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      input: Object.fromEntries(
        Object.entries(ENTRIES).map(([name, input]) => [name, resolve(root, input)]),
      ),
      output: sharedOutput,
    },
    watch: watch ? {} : null,
  },
})

if (!watch) assertClassicScripts()
