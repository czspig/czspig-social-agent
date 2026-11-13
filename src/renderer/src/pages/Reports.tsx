import { useEffect, useState, type ReactElement } from 'react'
import type { Report } from '../../../shared/types'
import { api, timeAgo, useData } from '../api'
import { Icon } from '../art'
import { CopyButton, Doc, Empty, useApp } from '../ui'

export default function Reports(): ReactElement {
  const { version, bump, say } = useApp()
  const { data } = useData<Report[]>('/reports', version)
  const [sel, setSel] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (data && (!sel || !data.some((r) => r.id === sel))) setSel(data[0]?.id ?? null)
  }, [data, sel])

  const current = data?.find((r) => r.id === sel) ?? null

  const generate = async (): Promise<void> => {
    setBusy(true)
    try {
      const r = await api.post<Report>('/reports/generate')
      setSel(r.id)
      setEditing(false)
      bump()
    } catch (e) {
      say('没有成功', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const save = async (): Promise<void> => {
    if (!current) return
    await api.post(`/reports/${current.id}`, { content: draft })
    setEditing(false)
    bump()
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">周报</h1>
          <p className="page-sub">暖暖根据你这周处理过的消息、完成的待办和开过的会来写，每一条都标了出处。</p>
        </div>
        <span className="grow" />
        <button className="btn primary" disabled={busy} onClick={generate}>
          {Icon.spark}
          {busy ? '暖暖在写…' : '写一份本周周报'}
        </button>
      </div>

      {data && !data.length ? (
        <div className="card">
          <Empty mood="calm" title="这周的周报还没写">
            点右上角的按钮，暖暖先替你起个草稿，你只需要改措辞。
          </Empty>
        </div>
      ) : (
        <div className="split">
          <div className="card">
            {data?.map((r) => (
              <button
                key={r.id}
                className={'list-item' + (r.id === sel ? ' on' : '')}
                onClick={() => {
                  setSel(r.id)
                  setEditing(false)
                }}
              >
                <div className="list-item-title">{r.content.split('\n')[0].replace(/^#\s*/, '')}</div>
                <div className="small muted">
                  {timeAgo(r.ts)}生成 · {r.sources.length} 条依据
                </div>
              </button>
            ))}
          </div>

          {current && (
            <div className="stack">
              <div className="card pad">
                <div className="row" style={{ marginBottom: 14 }}>
                  <span className="small muted grow">
                    {current.by === 'template' ? '按固定结构整理的草稿，接入模型后会归并得更像人写的' : '暖暖起草，请你改过再提交'}
                  </span>
                  {editing ? (
                    <>
                      <button className="btn sm primary" onClick={save}>
                        保存
                      </button>
                      <button className="btn sm ghost" onClick={() => setEditing(false)}>
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="btn sm"
                        onClick={() => {
                          setDraft(current.content)
                          setEditing(true)
                        }}
                      >
                        改一改
                      </button>
                      <CopyButton text={current.content.replace(/\s*\[\d+\]/g, '')} label="复制正文" />
                      <button className="icon-btn" aria-label="删除这份周报" onClick={() => api.del(`/reports/${current.id}`).then(bump)}>
                        {Icon.trash}
                      </button>
                    </>
                  )}
                </div>
                {editing ? (
                  <textarea className="textarea" style={{ minHeight: 420, fontFamily: 'inherit' }} value={draft} onChange={(e) => setDraft(e.target.value)} />
                ) : (
                  <Doc text={current.content} sources={current.sources} />
                )}
              </div>

              {current.sources.length > 0 && (
                <div className="card pad">
                  <div className="card-title">每条内容的依据</div>
                  <div className="stack" style={{ gap: 6 }}>
                    {current.sources.map((s, i) => (
                      <div key={i} className="row small" style={{ alignItems: 'flex-start' }}>
                        <span className="ref" style={{ marginLeft: 0, cursor: 'default' }}>
                          {i + 1}
                        </span>
                        <span className="muted" style={{ width: 34, flex: 'none' }}>
                          {s.type === 'message' ? '消息' : s.type === 'todo' ? '待办' : '会议'}
                        </span>
                        <span>{s.label.replace(/^(待办|会议) · /, '')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
