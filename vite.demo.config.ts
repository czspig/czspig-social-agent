import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Static web demo for GitHub Pages: the renderer plus the core engine running in the page.
const core = path.resolve('src/core')
const stubs: Record<string, string> = {
  './llm': path.resolve('src/web-demo/llm-stub.ts'),
  './feishu': path.resolve('src/web-demo/feishu-stub.ts')
}

const webDemo = (): Plugin => ({
  name: 'nuannuan-web-demo',
  enforce: 'pre',
  resolveId(source, importer) {
    if (importer && path.dirname(importer) === core && stubs[source]) return stubs[source]
    return null
  },
  transformIndexHtml: {
    order: 'pre',
    handler: (html) => html.replace('./src/main.tsx', '../web-demo/main.ts')
  }
})

export default defineConfig({
  root: path.resolve('src/renderer'),
  base: './',
  plugins: [webDemo(), react()],
  server: { host: '127.0.0.1', port: 5174, strictPort: true, fs: { allow: [path.resolve('src')] } },
  build: { outDir: path.resolve('dist-web'), emptyOutDir: true, target: 'es2022' }
})
