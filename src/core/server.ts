import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import type { AppEvent, Digest, Level, Meeting, Msg, Report, Rule, Settings, Todo } from '../shared/types'
import { Store, type SecretCodec } from './db'
import { Llm } from './llm'
import { Feishu } from './feishu'
import { Engine } from './engine'
import { parseDue } from './writers'

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

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
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

  type Handler = (ctx: { body: Record<string, unknown>; query: URLSearchParams; id: string }) => unknown | Promise<unknown>
  const routes: [string, RegExp, Handler][] = []
  const on = (method: string, pattern: string, h: Handler): void => {
    routes.push([method, new RegExp('^' + pattern.replace(':id', '([^/]+)') + '$'), h])
  }
  const str = (v: unknown): string => (typeof v === 'string' ? v : '')

  on('GET', '/api/home', () => engine.home())

  on('GET', '/api/messages', ({ query }) => {
    const days = Number(query.get('days') ?? '7')
    return store.all<Msg>('msgs', Date.now() - days * 86_400_000)
  })
  on('POST', '/api/messages/:id/level', ({ id, body }) => {
    const level = str(body.level) as Level
    if (!['urgent', 'normal', 'ignore'].includes(level)) throw new HttpError(400, '分级不正确')
    const remember = body.remember === 'person' || body.remember === 'chat' ? body.remember : null
    return engine.setLevel(id, level, remember)
  })
  on('POST', '/api/messages/:id/handled', ({ id, body }) => {
    engine.setHandled(id, body.handled !== false)
    return { ok: true }
  })
  on('POST', '/api/messages/:id/reply', ({ id }) => engine.reply(id))

  on('GET', '/api/rules', () => store.all<Rule>('rules'))
  on('POST', '/api/rules', ({ body }) => {
    const kind = str(body.kind) as Rule['kind']
    const level = str(body.level) as Level
    const value = str(body.value).trim()
    if (!['person', 'chat', 'keyword'].includes(kind) || !['urgent', 'normal', 'ignore'].includes(level) || !value) {
      throw new HttpError(400, '规则不完整')
    }
    return engine.addRule(kind, value, level)
  })
  on('DELETE', '/api/rules/:id', ({ id }) => {
    store.del('rules', id)
    return { ok: true }
  })

  on('GET', '/api/todos', () => ({ todos: store.all<Todo>('todos'), waiting: engine.waiting() }))
  on('POST', '/api/todos', ({ body }) => {
    const title = str(body.title).trim()
    if (!title) throw new HttpError(400, '写一下要做什么吧')
    return engine.addTodo(title, parseDue(str(body.due) || title, Date.now()))
  })
  on('POST', '/api/todos/:id', ({ id, body }) => {
    engine.setTodo(id, body.status === 'done' ? 'done' : 'open')
    return { ok: true }
  })
  on('DELETE', '/api/todos/:id', ({ id }) => {
    store.del('todos', id)
    return { ok: true }
  })

  on('GET', '/api/digests', () => store.all<Digest>('digests').slice(0, 30))
  on('POST', '/api/digests/run', () => engine.runDigest(true))
  on('POST', '/api/digests/morning', () => engine.runMorning())

  on('GET', '/api/meetings', () => store.all<Meeting>('meetings'))
  on('POST', '/api/meetings', ({ body }) => {
    const transcript = str(body.transcript).trim()
    if (transcript.length < 20) throw new HttpError(400, '文字稿太短了，暖暖整理不出内容')
    return engine.addMeeting(str(body.title).trim() || '未命名会议', transcript)
  })
  on('DELETE', '/api/meetings/:id', ({ id }) => {
    store.del('meetings', id)
    return { ok: true }
  })

  on('GET', '/api/reports', () => store.all<Report>('reports'))
  on('POST', '/api/reports/generate', () => engine.generateReport())
  on('POST', '/api/reports/:id', ({ id, body }) => {
    const r = store.get<Report>('reports', id)
    if (!r) throw new HttpError(404, '找不到这份周报')
    return store.put('reports', { ...r, content: str(body.content) })
  })
  on('DELETE', '/api/reports/:id', ({ id }) => {
    store.del('reports', id)
    return { ok: true }
  })

  on('POST', '/api/polish', ({ body }) => {
    const draft = str(body.text).trim()
    if (!draft) throw new HttpError(400, '先写个大意吧')
    const tone = body.tone === 'senior' || body.tone === 'cross' ? body.tone : 'peer'
    return engine.polish(draft, str(body.to).trim(), tone)
  })

  on('GET', '/api/people', () => engine.people())
  on('POST', '/api/people/note', ({ body }) => {
    const name = str(body.name).trim()
    if (!name) throw new HttpError(400, '写一下这个人的名字')
    engine.setNote(name, str(body.note))
    return { ok: true }
  })
  on('POST', '/api/people/find', ({ body }) => {
    const query = str(body.query).trim()
    if (query.length < 2) throw new HttpError(400, '说说你想办什么事')
    return engine.find(query)
  })

  on('POST', '/api/care/:id/dismiss', ({ id }) => {
    engine.dismissCare(id)
    return { ok: true }
  })

  const settingsView = (): unknown => ({
    settings: store.settings(),
    secrets: engine.secretStatus(),
    redirectUri,
    lastError: engine.lastError,
    canPush: feishu.canPush()
  })
  on('GET', '/api/settings', settingsView)
  on('POST', '/api/settings', ({ body }) => {
    const before = store.settings()
    if (body.settings && typeof body.settings === 'object') store.saveSettings(body.settings as Partial<Settings>)
    const secrets = (body.secrets ?? {}) as Record<string, unknown>
    if (typeof secrets.llmKey === 'string') store.setSecret('llmKey', secrets.llmKey.trim())
    if (typeof secrets.feishuSecret === 'string') store.setSecret('feishuSecret', secrets.feishuSecret.trim())
    if (typeof secrets.feishuWebhook === 'string') {
      const hook = secrets.feishuWebhook.trim()
      if (hook && !/^https:\/\/open\.(feishu\.cn|larksuite\.com)\/open-apis\/bot\/v2\/hook\//.test(hook)) {
        throw new HttpError(400, '这不像是飞书群机器人的 webhook 地址')
      }
      store.setSecret('feishuWebhook', hook)
    }
    const after = store.settings()
    if (before.feishuAppId !== after.feishuAppId || typeof secrets.feishuSecret === 'string') engine.restartBot()
    if (before.demoMode && !after.demoMode) {
      for (const c of ['msgs', 'todos', 'digests', 'meetings', 'reports', 'cares', 'people']) store.clear(c)
      store.kvDel('lastFetch')
    }
    if (!before.demoMode && after.demoMode) engine.resetDemo()
    emit({ type: 'refresh' })
    return settingsView()
  })

  on('POST', '/api/demo/reset', () => {
    engine.resetDemo()
    return { ok: true }
  })
  on('POST', '/api/sync', async () => {
    await engine.tick()
    return { ok: true, lastError: engine.lastError }
  })

  on('GET', '/api/feishu/login', () => {
    if (!feishu.appReady()) throw new HttpError(400, '先填好飞书应用的 App ID 和 App Secret')
    return { url: feishu.loginUrl(redirectUri) }
  })
  on('POST', '/api/feishu/logout', () => {
    feishu.logout()
    return { ok: true }
  })
  on('POST', '/api/feishu/test', async () => {
    if (!feishu.canPush()) throw new HttpError(400, '还没有可用的推送方式：登录飞书，或者填一个群机器人 webhook')
    await feishu.push({
      title: '暖暖猪来打个招呼',
      color: 'orange',
      lines: ['你好，我是暖暖猪。', '以后有要紧的消息，我会在这里第一时间告诉你；不急的，我攒起来一起说。'],
      footer: '这是一条测试消息'
    })
    return { ok: true }
  })

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
        for (const [method, re, handler] of routes) {
          const m = req.method === method ? url.pathname.match(re) : null
          if (!m) continue
          return send(200, (await handler({ body, query: url.searchParams, id: decodeURIComponent(m[1] ?? '') })) ?? null)
        }
        throw new HttpError(404, '没有这个接口')
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
