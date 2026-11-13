import { useState, type ReactElement } from 'react'
import type { Digest, Todo } from '../../../shared/types'
import { api, dueText, timeAgo, useData } from '../api'
import { Icon, Pig } from '../art'
import { Avatar, Empty, useApp } from '../ui'

interface TodoData {
  todos: Todo[]
  waiting: { name: string; since: number; count: number }[]
}

function TodoRow({ t }: { t: Todo }): ReactElement {
  const { bump } = useApp()
  const done = t.status === 'done'
  const due = t.due ? dueText(t.due) : null
  return (
    <div className={'todo' + (done ? ' done' : '')}>
      <button
        className={'check' + (done ? ' on' : '')}
        aria-label={done ? '标记为未完成' : '标记为完成'}
        onClick={() => api.post(`/todos/${t.id}`, { status: done ? 'open' : 'done' }).then(bump)}
      >
        {Icon.check}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="todo-title">{t.title}</div>
        <div className="row wrap small muted" style={{ gap: 8, marginTop: 3 }}>
          {due && !done && <span className={'chip ' + (due.late ? 'urgent' : 'normal')}>{due.text}</span>}
          <span>{t.sourceType === 'message' ? '来自消息' : t.sourceType === 'meeting' ? '来自会议' : '自己加的'}</span>
          {done && t.doneAt && <span>{timeAgo(t.doneAt)}完成</span>}
        </div>
      </div>
      <button className="icon-btn" aria-label="删除" onClick={() => api.del(`/todos/${t.id}`).then(bump)}>
        {Icon.trash}
      </button>
    </div>
  )
}

export default function Todos(): ReactElement {
  const { version, bump, say } = useApp()
  const { data } = useData<TodoData>('/todos', version)
  const digests = useData<Digest[]>('/digests', version)
  const [title, setTitle] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const morning = digests.data?.find((d) => d.kind === 'morning')
  const todos = data?.todos ?? []
  const now = Date.now()
  const end = new Date().setHours(23, 59, 59, 999)
  const open = todos.filter((t) => t.status === 'open').sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity))
  const groups: [string, Todo[]][] = [
    ['已经过了约定时间', open.filter((t) => t.due && t.due < now)],
    ['今天要做完', open.filter((t) => t.due && t.due >= now && t.due <= end)],
    ['之后再说', open.filter((t) => t.due && t.due > end)],
    ['没说什么时候要', open.filter((t) => !t.due)]
  ]
  const done = todos.filter((t) => t.status === 'done').sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0))

  const add = async (): Promise<void> => {
    if (!title.trim()) return
    try {
      await api.post('/todos', { title })
      setTitle('')
      bump()
    } catch (e) {
      say('没有成功', (e as Error).message)
    }
  }
  const brief = async (): Promise<void> => {
    setBusy(true)
    try {
      await api.post('/digests/morning')
      bump()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">待办</h1>
          <p className="page-sub">别人请你做的事，暖暖从消息和会议里替你记下来了。</p>
        </div>
      </div>

      <div className="stack">
        <div className="card pad brief">
          <Pig size={60} mood="happy" float />
          <div style={{ flex: 1, minWidth: 0 }}>
            {morning ? (
              <>
                <p className="brief-title">{morning.title}</p>
                <ul>
                  {morning.lines.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
                <div className="small muted" style={{ marginTop: 8 }}>
                  {timeAgo(morning.ts)}的早报
                </div>
              </>
            ) : (
              <>
                <p className="brief-title">每天早上，暖暖会给你一份早报</p>
                <div className="muted">告诉你今天要处理什么、谁在等你、哪些快到期。</div>
              </>
            )}
          </div>
          <button className="btn sm" disabled={busy} onClick={brief}>
            {morning ? '重新整理' : '现在来一份'}
          </button>
        </div>

        {data && data.waiting.length > 0 && (
          <div className="card pad">
            <div className="card-title">正在等你回复的人</div>
            <div className="row wrap" style={{ gap: 14 }}>
              {data.waiting.map((w) => (
                <div key={w.name} className="row" style={{ gap: 8 }}>
                  <Avatar name={w.name} />
                  <div>
                    <div style={{ fontWeight: 600, lineHeight: 1.3 }}>{w.name}</div>
                    <div className="small muted">{timeAgo(w.since) === '刚刚' ? '刚来找你' : '等了 ' + timeAgo(w.since).replace('前', '')}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card">
          <div className="row" style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
            <input
              className="input"
              placeholder="自己加一件事，比如：周五前把说明文档发给王磊"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
            />
            <button className="btn primary" onClick={add} disabled={!title.trim()}>
              {Icon.plus}记下来
            </button>
          </div>
          {data && !open.length && <Empty title="待办都清空了">歇一会儿吧，有新的事暖暖会记下来。</Empty>}
          {groups.map(
            ([label, list]) =>
              list.length > 0 && (
                <div key={label}>
                  <div className="section-label">{label}</div>
                  {list.map((t) => (
                    <TodoRow key={t.id} t={t} />
                  ))}
                </div>
              )
          )}
          {done.length > 0 && (
            <div style={{ borderTop: '1px solid var(--line)' }}>
              <button className="btn ghost sm" style={{ margin: '10px 12px' }} onClick={() => setShowDone((v) => !v)}>
                {showDone ? '收起' : '查看'}已完成的 {done.length} 件
              </button>
              {showDone && done.map((t) => <TodoRow key={t.id} t={t} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
