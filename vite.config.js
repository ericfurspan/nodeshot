import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { defineConfig } from 'vite'
import { resolve } from 'path'
import { copyFileSync, mkdirSync, cpSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function copyStaticAssets() {
  return {
    name: 'copy-static',
    closeBundle() {
      copyFileSync('manifest.json', 'dist/manifest.json')
      copyFileSync('src/preview.html', 'dist/preview.html')
      mkdirSync('dist/assets', { recursive: true })
      cpSync('src/assets', 'dist/assets', { recursive: true })
    },
  }
}

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background.js'),
        content: resolve(__dirname, 'src/content.js'),
        preview: resolve(__dirname, 'src/preview.js'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: 'assets/[name].[ext]',
        format: 'es',
      },
    },
  },
  plugins: [copyStaticAssets()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
  },
})
