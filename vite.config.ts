import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Tauri 期望固定的开发端口；frontendDist 对应 tauri.conf.json 的 ../dist
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: false,
    hmr: { protocol: 'ws', host: 'localhost', port: 1421 },
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
  envPrefix: ['VITE_', 'TAURI_'],
})
