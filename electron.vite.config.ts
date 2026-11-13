import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const core = `http://127.0.0.1:${process.env.NUANNUAN_PORT ?? '4317'}`

export default defineConfig({
  main: {},
  renderer: {
    plugins: [react()],
    server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api': { target: core, changeOrigin: false } } }
  }
})
