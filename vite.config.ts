import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// Tauri 期望固定的开发端口；frontendDist 对应 tauri.conf.json 的 ../dist
export default defineConfig({
  plugins: [
    vue({
      // Vue 3.6 Vapor：全量 vapor 编译，不打包虚拟 DOM 运行时
      features: { vapor: true },
    }),
    tailwindcss(),
  ],
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
