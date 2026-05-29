import { defineConfig } from 'vite'

// Build is orchestrated per-entry by scripts/build.mjs (see the comment there for
// why). This config holds the shared build output options it reuses, plus the
// Vitest configuration.
export const sharedOutput = {
  entryFileNames: '[name].js',
  assetFileNames: 'assets/[name].[ext]',
  format: 'es',
  // Fold every dependency (incl. CJS-interop runtime helpers) into the one output
  // file so no shared chunk — and therefore no `import` statement — is emitted.
  // Required because every entry runs as a classic script.
  codeSplitting: false,
}

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
  },
})
