import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import type { AppEvent, HomeData } from '../../shared/types'
import { useData } from './api'
import { Icon, Pig } from './art'
import { AppCtx } from './ui'
import Home from './pages/Home'
import Messages from './pages/Messages'
import Todos from './pages/Todos'
import Meetings from './pages/Meetings'
import Reports from './pages/Reports'
import People from './pages/People'
import Settings from './pages/Settings'

interface Toast {
  id: number
  title: string
  body?: string
  urgent?: boolean
}

const NAV: [string, string, ReactElement][] = [
  ['home', '今天', Icon.home],
  ['messages', '消息', Icon.chat],
  ['todos', '待办', Icon.todo],
  ['meetings', '会议', Icon.mic],
  ['reports', '周报', Icon.note],
  ['people', '找人', Icon.people]
]

export default function App(): ReactElement {
  const [page, setPage] = useState('home')
  const [arg, setArg] = useState<string | undefined>()
  const [version, setVersion] = useState(0)
  const [toasts, setToasts] = useState<Toast[]>([])

  const bump = useCallback(() => setVersion((v) => v + 1), [])
  const say = useCallback((title: string, body?: string, urgent?: boolean) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t.slice(-3), { id, title, body, urgent }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), urgent ? 12000 : 5000)
  }, [])
  const go = useCallback((p: string, a?: string) => {
    setPage(p)
    setArg(a)
    document.querySelector('.main')?.scrollTo({ top: 0 })
  }, [])

  useEffect(() => {
    const es = new EventSource('/api/events')
    es.onmessage = (ev) => {
      const e = JSON.parse(ev.data as string) as AppEvent
      bump()
      if (e.type !== 'refresh' && e.title) say(e.title, e.body, e.type === 'urgent')
    }
    const t = setInterval(bump, 60_000)
    return () => {
      es.close()
      clearInterval(t)
    }
  }, [bump, say])

  const { data: home, error } = useData<HomeData>('/home', version)
  const theme = home?.theme ?? 'system'
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      document.documentElement.dataset.theme = theme === 'system' ? (mq.matches ? 'dark' : 'light') : theme
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])

  const ctx = useMemo(() => ({ version, bump, say, go }), [version, bump, say, go])
  const badge: Record<string, number> = { messages: home?.counts.urgent ?? 0, todos: home?.counts.todos ?? 0 }

  return (
    <AppCtx.Provider value={ctx}>
      <div className="app">
        <aside className="side">
          <div className="brand">
            <Pig size={46} mood={home && home.counts.urgent === 0 ? 'happy' : 'calm'} />
            <div>
              <div className="brand-name">暖暖猪</div>
              <div className="brand-sub">替你看着消息</div>
            </div>
          </div>
          <nav className="nav">
            {NAV.map(([key, label, icon]) => (
              <button key={key} className={'nav-item' + (page === key ? ' on' : '')} onClick={() => go(key)} aria-current={page === key}>
                {icon}
                <span>{label}</span>
                {badge[key] > 0 && <span className={'nav-badge' + (key === 'todos' ? ' soft' : '')}>{badge[key]}</span>}
              </button>
            ))}
          </nav>
          <div className="side-foot">
            {home && (
              <>
                <div>
                  <span className={'dot ' + (home.demoMode ? 'demo' : home.feishu.feishuLogin ? 'ok' : '')} />
                  {home.demoMode ? '演示模式' : home.feishu.feishuLogin ? '飞书已连接' : '飞书未连接'}
                </div>
                <div>
                  <span className={'dot ' + (home.llmReady ? 'ok' : '')} />
                  {home.llmReady ? '模型已接入' : '模型未接入'}
                </div>
              </>
            )}
          </div>
          <nav className="nav" style={{ marginTop: 10 }}>
            <button className={'nav-item' + (page === 'settings' ? ' on' : '')} onClick={() => go('settings')}>
              {Icon.gear}
              <span>设置</span>
            </button>
          </nav>
        </aside>

        <main className="main">
          {error && !home ? (
            <div className="page">
              <div className="empty">
                <Pig size={96} mood="sleepy" />
                <div className="voice">暖暖还没醒过来</div>
                <div className="small">后台服务没有连上：{error}</div>
              </div>
            </div>
          ) : (
            <>
              {page === 'home' && <Home />}
              {page === 'messages' && <Messages arg={arg} />}
              {page === 'todos' && <Todos />}
              {page === 'meetings' && <Meetings />}
              {page === 'reports' && <Reports />}
              {page === 'people' && <People />}
              {page === 'settings' && <Settings />}
            </>
          )}
        </main>

        <div className="toasts" role="status">
          {toasts.map((t) => (
            <div key={t.id} className={'toast' + (t.urgent ? ' urgent' : '')}>
              <Pig size={34} mood={t.urgent ? 'calm' : 'happy'} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="toast-title">{t.title}</div>
                {t.body && <div className="toast-body">{t.body}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppCtx.Provider>
  )
}
