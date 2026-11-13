import { createContext, useContext, useState, type ReactElement, type ReactNode } from 'react'
import type { Level, Msg } from '../../shared/types'
import { Icon, Pig, type Mood } from './art'
import { api, copyText, timeAgo } from './api'

export interface Ctx {
  version: number
  bump: () => void
  say: (title: string, body?: string, urgent?: boolean) => void
  go: (page: string, arg?: string) => void
}

export const AppCtx = createContext<Ctx>({ version: 0, bump: () => {}, say: () => {}, go: () => {} })
export const useApp = (): Ctx => useContext(AppCtx)

export const LEVEL_NAME: Record<Level, string> = { urgent: '要马上看', normal: '晚点汇总', ignore: '不用看' }

export function Avatar({ name }: { name: string }): ReactElement {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 997
  return <div className={`avatar a${h % 5}`}>{name.slice(0, 1)}</div>
}

export function Empty({ mood = 'happy', title, children }: { mood?: Mood; title: string; children?: ReactNode }): ReactElement {
  return (
    <div className="empty">
      <Pig size={84} mood={mood} float />
      <div className="voice">{title}</div>
      {children && <div className="small">{children}</div>}
    </div>
  )
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }): ReactElement {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={'switch' + (on ? ' on' : '')} onClick={() => onChange(!on)} />
}

export function CopyButton({ text, label = '复制' }: { text: string; label?: string }): ReactElement {
  const [done, setDone] = useState(false)
  return (
    <button
      className="btn sm"
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true)
          setTimeout(() => setDone(false), 1600)
        }
      }}
    >
      {done ? Icon.check : Icon.copy}
      {done ? '已复制' : label}
    </button>
  )
}

export function MsgRow({ m, showLevel = false }: { m: Msg; showLevel?: boolean }): ReactElement {
  const { bump, say } = useApp()
  const [busy, setBusy] = useState(false)
  const [reply, setReply] = useState<{ text: string; by?: string } | null>(
    m.suggestedReply ? { text: m.suggestedReply, by: m.replyBy } : null
  )
  const [adjust, setAdjust] = useState(false)

  const act = async (fn: () => Promise<unknown>): Promise<void> => {
    setBusy(true)
    try {
      await fn()
      bump()
    } catch (e) {
      say('没有成功', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={'msg' + (m.handled ? ' done' : '')}>
      <Avatar name={m.senderName} />
      <div className="msg-body">
        <div className="msg-head">
          <span className="msg-name">{m.senderName}</span>
          <span className="msg-meta">
            {m.chatType === 'p2p' ? '私聊' : m.chatName} · {timeAgo(m.ts)}
          </span>
          {showLevel && <span className={'chip ' + m.level}>{LEVEL_NAME[m.level]}</span>}
          {m.held && <span className="chip sky">免打扰中，暂未提醒</span>}
        </div>
        <p className="msg-text">{m.text}</p>
        <div className="msg-why">
          暖暖的判断：{m.reason}
          {m.source === 'llm' && ' · 模型判断'}
        </div>

        {reply && (
          <div className="reply">
            <p className="reply-text">{reply.text}</p>
            <div className="row wrap">
              <CopyButton text={reply.text} label="复制后自己去发" />
              <span className="small muted">{reply.by === 'llm' ? '暖暖起草，发之前请你过目' : '这是一句通用回复，接入模型后会更贴合内容'}</span>
            </div>
          </div>
        )}

        <div className="msg-actions">
          {m.handled ? (
            <button className="btn sm ghost" disabled={busy} onClick={() => act(() => api.post(`/messages/${m.id}/handled`, { handled: false }))}>
              撤销已处理
            </button>
          ) : (
            <button className={"btn sm" + (m.level === "urgent" ? " primary" : "")} disabled={busy} onClick={() => act(() => api.post(`/messages/${m.id}/handled`, { handled: true }))}>
              {Icon.check}我处理好了
            </button>
          )}
          {!m.handled && m.level !== 'ignore' && (
            <button
              className="btn sm"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  const next = await api.post<Msg>(`/messages/${m.id}/reply`)
                  setReply({ text: next.suggestedReply ?? '', by: next.replyBy })
                })
              }
            >
              {Icon.spark}
              {reply ? '换一句' : '帮我想句回复'}
            </button>
          )}
          <button className="btn sm ghost" onClick={() => setAdjust((v) => !v)}>
            暖暖判断得不对
          </button>
        </div>

        {adjust && (
          <div className="reply">
            <div className="small" style={{ marginBottom: 8 }}>
              这条应该算哪一类？
            </div>
            <div className="row wrap">
              {(['urgent', 'normal', 'ignore'] as Level[])
                .filter((l) => l !== m.level)
                .map((l) => (
                  <span key={l} className="row" style={{ gap: 6 }}>
                    <button className="btn sm" disabled={busy} onClick={() => act(() => api.post(`/messages/${m.id}/level`, { level: l })).then(() => setAdjust(false))}>
                      只改这条为「{LEVEL_NAME[l]}」
                    </button>
                    <button
                      className="btn sm"
                      disabled={busy}
                      onClick={() =>
                        act(() => api.post(`/messages/${m.id}/level`, { level: l, remember: 'person' })).then(() => {
                          setAdjust(false)
                          say('暖暖记住了', `以后${m.senderName}的消息都算「${LEVEL_NAME[l]}」`)
                        })
                      }
                    >
                      以后{m.senderName}都算「{LEVEL_NAME[l]}」
                    </button>
                  </span>
                ))}
              {m.chatType === 'group' && (
                <button
                  className="btn sm"
                  disabled={busy}
                  onClick={() =>
                    act(() => api.post(`/messages/${m.id}/level`, { level: 'ignore', remember: 'chat' })).then(() => {
                      setAdjust(false)
                      say('暖暖记住了', `「${m.chatName}」里的消息以后不用看`)
                    })
                  }
                >
                  「{m.chatName}」这个群以后不用看
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function Doc({ text, sources }: { text: string; sources?: { label: string }[] }): ReactElement {
  const inline = (s: string, key: number): ReactNode[] =>
    s.split(/(\[\d+\])/g).map((part, i) => {
      const m = part.match(/^\[(\d+)\]$/)
      if (!m) return <span key={`${key}-${i}`}>{part}</span>
      const src = sources?.[Number(m[1]) - 1]
      return (
        <span key={`${key}-${i}`} className="ref" title={src ? `依据：${src.label}` : '依据'}>
          {m[1]}
        </span>
      )
    })
  const blocks: ReactNode[] = []
  let list: ReactNode[] = []
  const flush = (): void => {
    if (list.length) blocks.push(<ul key={'ul' + blocks.length}>{list}</ul>)
    list = []
  }
  text.split(/\r?\n/).forEach((line, i) => {
    const t = line.trim()
    if (!t) return flush()
    if (t.startsWith('# ')) {
      flush()
      blocks.push(<h1 key={i}>{t.slice(2)}</h1>)
    } else if (t.startsWith('## ')) {
      flush()
      blocks.push(<h2 key={i}>{t.slice(3)}</h2>)
    } else if (/^[-*]\s+/.test(t)) {
      list.push(<li key={i}>{inline(t.replace(/^[-*]\s+/, ''), i)}</li>)
    } else {
      flush()
      blocks.push(<p key={i}>{inline(t, i)}</p>)
    }
  })
  flush()
  return <div className="doc">{blocks}</div>
}
