import { defineConfig } from 'vite'

// Build is orchestrated by scripts/build.mjs (see the comment there). This config
// holds the shared build output options it reuses, plus the Vitest configuration.
//
// Note there is no `codeSplitting: false` here: Rolldown rejects it for a
// multi-entry build. Nothing is shared between the two entries today, so no chunk
// is emitted — and scripts/build.mjs asserts that after every build, since a shared
// chunk would make the entries `import`, which is fatal for classic scripts.
export const sharedOutput = {
  entryFileNames: '[name].js',
  assetFileNames: 'assets/[name].[ext]',
  format: 'es',
}

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
  },
})
