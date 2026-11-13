import { useState, type ReactElement } from 'react'
import type { FindResult, Person } from '../../../shared/types'
import { api, timeAgo, useData } from '../api'
import { Icon, Pig } from '../art'
import { Avatar, CopyButton, Empty, useApp } from '../ui'

const EXAMPLES = ['测试环境的数据库权限找谁开', '提测流程怎么走', '登录页的埋点方案问谁']

function NoteRow({ p }: { p: Person }): ReactElement {
  const { bump, say } = useApp()
  const [note, setNote] = useState(p.note)
  const save = (): void => {
    if (note.trim() === p.note) return
    api
      .post('/people/note', { name: p.name, note })
      .then(bump)
      .catch((e: Error) => say('没有保存成功', e.message))
  }
  return (
    <div className="msg">
      <Avatar name={p.name} />
      <div className="msg-body">
        <div className="msg-head">
          <span className="msg-name">{p.name}</span>
          <span className="msg-meta">{p.count ? `找过你 ${p.count} 次 · 最近 ${timeAgo(p.lastTs)}` : '你自己加的'}</span>
          {p.chats.slice(0, 3).map((c) => (
            <span key={c} className="chip">
              {c}
            </span>
          ))}
        </div>
        <input
          className="input"
          style={{ marginTop: 8 }}
          placeholder="记一句：这个人负责什么、什么事找他"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </div>
    </div>
  )
}

export default function People(): ReactElement {
  const { version, bump, say } = useApp()
  const { data } = useData<Person[]>('/people', version)
  const [query, setQuery] = useState('')
  const [asked, setAsked] = useState('')
  const [result, setResult] = useState<FindResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')

  const find = async (q = query): Promise<void> => {
    if (q.trim().length < 2) return
    setBusy(true)
    try {
      setResult(await api.post<FindResult>('/people/find', { query: q }))
      setAsked(q)
    } catch (e) {
      say('没有成功', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const add = async (): Promise<void> => {
    try {
      await api.post('/people/note', { name, note })
      setName('')
      setNote('')
      bump()
    } catch (e) {
      say('没有成功', (e as Error).message)
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">找人</h1>
          <p className="page-sub">不知道一件事该找谁？告诉暖暖，它从你的消息和笔记里帮你想。</p>
        </div>
      </div>

      <div className="stack">
        <div className="card pad ask">
          <Pig size={64} mood="happy" float />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="h2">你想办什么事？</div>
            <div className="row" style={{ marginTop: 10 }}>
              <input
                className="input"
                placeholder="比如：想开测试环境的数据库权限"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && find()}
              />
              <button className="btn primary" disabled={busy || query.trim().length < 2} onClick={() => find()}>
                {Icon.spark}
                {busy ? '暖暖在想…' : '帮我找人'}
              </button>
            </div>
            <div className="row wrap small" style={{ marginTop: 10, gap: 6 }}>
              <span className="muted">试试：</span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  className="btn sm ghost"
                  onClick={() => {
                    setQuery(ex)
                    void find(ex)
                  }}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        </div>

        {result && (
          <div className="card pad">
            <div className="card-title">「{asked}」</div>
            {result.matches.length ? (
              <>
                <div className="stack" style={{ gap: 10 }}>
                  {result.matches.map((m, i) => (
                    <div key={m.name} className={'match' + (i === 0 ? ' top' : '')}>
                      <Avatar name={m.name} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="row" style={{ gap: 8 }}>
                          <span className="msg-name">{m.name}</span>
                          {i === 0 && <span className="chip urgent">最可能是他</span>}
                        </div>
                        <div style={{ color: 'var(--ink-2)' }}>{m.why}</div>
                        {m.evidence.map((e, n) => (
                          <div key={n} className="quote-line">
                            {e}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {result.draft && (
                  <>
                    <div className="h3">可以这样开口</div>
                    <div className="reply" style={{ marginTop: 0 }}>
                      <p className="reply-text">{result.draft}</p>
                      <div className="row wrap">
                        <CopyButton text={result.draft} label="复制后自己去发" />
                        <span className="small muted">
                          {result.by === 'llm' ? '暖暖起草，发之前请你过目' : '按关键词匹配找的人，开场白是固定句式。接入模型后会更准'}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </>
            ) : (
              <Empty mood="calm" title="暖暖没有找到线索">
                你的消息和笔记里没有提到相关的事。可以在下面给同事记一句备注，下次就能找到了。
              </Empty>
            )}
          </div>
        )}

        <div className="card">
          <div className="card-title" style={{ padding: '16px 18px 0', margin: 0 }}>
            你的通讯录笔记
          </div>
          <div className="row wrap" style={{ padding: '12px 18px', borderBottom: '1px solid var(--line)' }}>
            <input className="input" style={{ width: 130 }} placeholder="名字" value={name} onChange={(e) => setName(e.target.value)} />
            <input
              className="input"
              style={{ flex: 1, minWidth: 200, width: 'auto' }}
              placeholder="负责什么，比如：财务，报销和发票找她"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && note.trim() && add()}
            />
            <button className="btn" disabled={!name.trim() || !note.trim()} onClick={add}>
              {Icon.plus}记一个人
            </button>
          </div>
          {data?.map((p) => <NoteRow key={p.name + '|' + p.note} p={p} />)}
          {data && !data.length && (
            <Empty mood="sleepy" title="还没有认识的人">
              收到消息后，同事会自动出现在这里。
            </Empty>
          )}
        </div>
      </div>
    </div>
  )
}
