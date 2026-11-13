// Entry for the static web demo (GitHub Pages). It runs the real Engine and route table
// in the page and answers the UI's /api calls and /api/events stream locally, so the
// renderer runs unchanged with no server behind it.
import type { AppEvent } from '../shared/types'
import type { Store } from '../core/db'
import type { Feishu as RealFeishu } from '../core/feishu'
import type { Llm as RealLlm } from '../core/llm'
import { Engine } from '../core/engine'
import { buildRoutes, HttpError } from '../core/routes'
import { MemStore } from './memstore'
import { Llm } from './llm-stub'
import { Feishu } from './feishu-stub'

const store = new MemStore()
const listeners = new Set<(data: string) => void>()
const emit = (e: AppEvent): void => {
  const data = JSON.stringify(e)
  listeners.forEach((fn) => fn(data))
}
const feishu = new Feishu()
const engine = new Engine(store as unknown as Store, new Llm() as unknown as RealLlm, feishu as unknown as RealFeishu, emit)
const dispatch = buildRoutes({
  store: store as unknown as Store,
  engine,
  feishu: feishu as unknown as RealFeishu,
  emit,
  redirectUri: ''
})

const json = (status: number, data: unknown): Response =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })

const apiPath = (url: URL): string | null => {
  const i = url.pathname.indexOf('/api/')
  return url.origin === location.origin && i >= 0 ? url.pathname.slice(i) : null
}

const realFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const req = new Request(input, init)
  const path = apiPath(new URL(req.url))
  if (!path) return realFetch(input, init)
  try {
    const text = req.method === 'GET' ? '' : await req.text()
    const body = text ? (JSON.parse(text) as Record<string, unknown>) : {}
    // Wiping the demo is a fresh start: clear everything, then reseed.
    if (path === '/api/demo/reset') store.wipe()
    return json(200, await dispatch(req.method, path, new URL(req.url).searchParams, body))
  } catch (e) {
    return json(e instanceof HttpError ? e.status : 500, { error: (e as Error).message || '出了点问题' })
  }
}

class LocalEventSource extends EventTarget {
  onmessage: ((ev: MessageEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  readyState = 1
  private fn = (data: string): void => {
    const ev = new MessageEvent('message', { data })
    this.onmessage?.(ev)
    this.dispatchEvent(ev)
  }
  constructor(readonly url: string) {
    super()
    listeners.add(this.fn)
  }
  close(): void {
    this.readyState = 2
    listeners.delete(this.fn)
  }
}
const RealEventSource = window.EventSource
window.EventSource = function (url: string | URL, init?: EventSourceInit) {
  const u = new URL(String(url), location.href)
  return apiPath(u) ? new LocalEventSource(u.href) : new RealEventSource(url, init)
} as unknown as typeof EventSource

engine.start()
document.documentElement.classList.add('web-demo')

await import('../renderer/src/main')
