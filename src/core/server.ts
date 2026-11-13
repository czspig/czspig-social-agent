import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import type { AppEvent } from '../shared/types'
import { Store, type SecretCodec } from './db'
import { Llm } from './llm'
import { Feishu } from './feishu'
import { Engine } from './engine'
import { buildRoutes, HttpError } from './routes'

export interface CoreOptions {
  dataDir: string
  port: number
  staticDir?: string
  codec?: SecretCodec
  devOrigins?: string[]
  onEvent?: (e: AppEvent) => void
}

export interface Core {
  port: number
  engine: Engine
  close(): void
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon'
}


export function startCore(opts: CoreOptions): Promise<Core> {
  const store = new Store(opts.dataDir, opts.codec)
  const llm = new Llm(store)
  const feishu = new Feishu(store)
  const clients = new Set<http.ServerResponse>()
  const emit = (e: AppEvent): void => {
    const line = `data: ${JSON.stringify(e)}\n\n`
    clients.forEach((c) => c.write(line))
    if (e.type !== 'refresh') opts.onEvent?.(e)
  }
  const engine = new Engine(store, llm, feishu, emit)
  const origin = `http://127.0.0.1:${opts.port}`
  const allowed = new Set([origin, `http://localhost:${opts.port}`, ...(opts.devOrigins ?? [])])
  const redirectUri = `${origin}/api/feishu/callback`

  const dispatch = buildRoutes({ store, engine, feishu, emit, redirectUri })

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', origin)
    const send = (status: number, data: unknown): void => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify(data))
    }
    try {
      const reqOrigin = req.headers.origin
      if (reqOrigin && !allowed.has(reqOrigin)) throw new HttpError(403, '不允许的来源')
      if (reqOrigin) {
        res.setHeader('access-control-allow-origin', reqOrigin)
        res.setHeader('access-control-allow-headers', 'content-type')
        res.setHeader('access-control-allow-methods', 'GET,POST,DELETE,OPTIONS')
      }
      if (req.method === 'OPTIONS') return void res.writeHead(204).end()

      if (url.pathname === '/api/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' })
        res.write(': hello\n\n')
        clients.add(res)
        req.on('close', () => clients.delete(res))
        return
      }

      if (url.pathname === '/api/feishu/callback') {
        let message = ''
        try {
          const name = await feishu.finishLogin(url.searchParams.get('code') ?? '', url.searchParams.get('state') ?? '', redirectUri)
          if (!store.settings().userName) store.saveSettings({ userName: name })
          message = `${name}，登录好了。可以关掉这个页面，回到暖暖猪。`
          emit({ type: 'refresh' })
        } catch (e) {
          message = '登录没有成功：' + (e as Error).message
        }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        const safe = message.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)
        return void res.end(
          `<!doctype html><meta charset="utf-8"><title>暖暖猪</title><body style="font-family:sans-serif;background:#FAF9F5;color:#3D3D3A;display:grid;place-items:center;height:100vh;margin:0"><p style="font-size:18px">${safe}</p></body>`
        )
      }

      if (url.pathname.startsWith('/api/')) {
        if (req.method !== 'GET' && !(req.headers['content-type'] ?? '').includes('application/json')) {
          throw new HttpError(415, '请求格式不正确')
        }
        let body: Record<string, unknown> = {}
        if (req.method !== 'GET') {
          const chunks: Buffer[] = []
          let size = 0
          for await (const c of req) {
            size += (c as Buffer).length
            if (size > 5_000_000) throw new HttpError(413, '内容太长了')
            chunks.push(c as Buffer)
          }
          const raw = Buffer.concat(chunks).toString('utf8')
          body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
        }
        return send(200, await dispatch(req.method ?? 'GET', url.pathname, url.searchParams, body))
      }

      if (!opts.staticDir) throw new HttpError(404, '界面还没有构建')
      const rel = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '')
      let file = path.join(opts.staticDir, rel)
      if (!file.startsWith(opts.staticDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        file = path.join(opts.staticDir, 'index.html')
      }
      if (!fs.existsSync(file)) throw new HttpError(404, '界面还没有构建，开发时请打开 http://localhost:5173')
      res.writeHead(200, {
        'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
        'content-security-policy':
          "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'",
        'x-content-type-options': 'nosniff'
      })
      fs.createReadStream(file).pipe(res)
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500
      if (!res.headersSent) send(status, { error: (e as Error).message || '出了点问题' })
      else res.end()
    }
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(opts.port, '127.0.0.1', () => {
      engine.start()
      resolve({
        port: opts.port,
        engine,
        close: () => {
          engine.stop()
          clients.forEach((c) => c.end())
          server.close()
          store.close()
        }
      })
    })
  })
}
