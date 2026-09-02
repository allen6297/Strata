import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  optimizeDeps: {
    exclude: ['@/wasm/rosegold/rosegold_wasm.js'],
  },
  server: {
    host: host || '0.0.0.0',
    port: 4521,
    strictPort: true,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 4521,
        }
      : undefined,
    watch: {
      // Game scripts/assets live in this repo. A .rg save must not
      // full-reload the editor webview.
      ignored: [
        '**/src-tauri/**',
        '**/crates/**',
        '**/target/**',
        '**/examples/**',
        '**/*.rg',
        '**/*.scene',
        '**/*.wasm',
        '**/*.md',
      ],
    },
  },
})
