import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves this repository from /talk/. Capacitor and local
  // builds keep relative asset URLs so the same bundle still works via file://.
  base: process.env.VITE_DEPLOY_TARGET === 'github-pages' ? '/talk/' : './',
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    host: true,
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        // Split large, rarely-changing vendor deps into their own cacheable chunks
        // so the main app chunk stays small and page-level code-splitting can shine.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('dexie')) return 'vendor-db'
          if (id.includes('react-router') || id.includes('react-dom') || /[\\/]node_modules[\\/]react[\\/]/.test(id) || id.includes('scheduler')) {
            return 'vendor-react'
          }
        },
      },
    },
  },
})
