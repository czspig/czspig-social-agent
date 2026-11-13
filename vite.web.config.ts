import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

const core = `http://127.0.0.1:${process.env.NUANNUAN_PORT ?? '4317'}`

export default defineConfig({
  root: path.resolve('src/renderer'),
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api': { target: core, changeOrigin: false } } },
  build: { outDir: path.resolve('out/renderer'), emptyOutDir: true }
})
