import { useEffect, useState, type ReactElement } from 'react'
import type { Meeting } from '../../../shared/types'
import { api, timeAgo, useData } from '../api'
import { Icon } from '../art'
import { CopyButton, Empty, useApp } from '../ui'

const SAMPLE = `小周：这次主要对一下新人入职流程的优化。
我：现在的问题是权限申请要找三个人，平均要等两天。
老陈：可以做成一张统一的申请单，运维这边一次性开通。
小周：那结论是：权限申请合并成一张单，由运维统一处理。
老陈：我来出申请单的模板，周三之前完成。
我：可以，我周五前把新流程的说明写好发到群里。
小周：好的，那今天就到这。`

function asText(m: Meeting): string {
  return [
    `【${m.title}】会议纪要`,
    m.summary,
    '',
    '结论：',
    ...m.conclusions.map((c, i) => `${i + 1}. ${c}`),
    '',
    '待办：',
    ...m.actionItems.map((a) => `- ${a.owner}：${a.task}（${a.due}）`)
  ].join('\n')
}

export default function Meetings(): ReactElement {
  const { version, bump, say } = useApp()
  const { data } = useData<Meeting[]>('/meetings', version)
  const [sel, setSel] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [transcript, setTranscript] = useState('')
  const [busy, setBusy] = useState(false)
  const [showRaw, setShowRaw] = useState(false)

  useEffect(() => {
    if (data && !creating && (!sel || !data.some((m) => m.id === sel))) setSel(data[0]?.id ?? null)
  }, [data, sel, creating])

  const current = data?.find((m) => m.id === sel) ?? null

  const submit = async (): Promise<void> => {
    setBusy(true)
    try {
      const m = await api.post<Meeting>('/meetings', { title, transcript })
      setCreating(false)
      setTitle('')
      setTranscript('')
      setSel(m.id)
      bump()
      say('纪要整理好了', '分给你的事已经记进待办。')
    } catch (e) {
      say('没有成功', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">会议</h1>
          <p className="page-sub">把会议的文字稿交给暖暖，它帮你理出结论、待办和负责人。</p>
        </div>
        <span className="grow" />
        <button className="btn primary" onClick={() => setCreating(true)}>
          {Icon.plus}整理一场会议
        </button>
      </div>

      <div className="split">
        <div className="card">
          {data?.map((m) => (
            <button
              key={m.id}
              className={'list-item' + (!creating && m.id === sel ? ' on' : '')}
              onClick={() => {
                setCreating(false)
                setSel(m.id)
                setShowRaw(false)
              }}
            >
              <div className="list-item-title">{m.title}</div>
              <div className="small muted">
                {timeAgo(m.ts)} · {m.conclusions.length} 条结论 · {m.actionItems.length} 项待办
              </div>
            </button>
          ))}
          {data && !data.length && <div className="empty small">还没有整理过会议</div>}
        </div>

        {creating ? (
          <div className="card pad stack">
            <div className="h2">整理一场会议</div>
            <input className="input" placeholder="会议名称" value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea
              className="textarea"
              style={{ minHeight: 260 }}
              placeholder={'把文字稿粘贴到这里，每行一段发言，例如：\n张三：我觉得方案可以\n\n飞书妙记可以直接导出文字稿。'}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
            />
            <div className="row wrap">
              <button className="btn primary" disabled={busy || transcript.trim().length < 20} onClick={submit}>
                {Icon.spark}
                {busy ? '暖暖在整理…' : '开始整理'}
              </button>
              <button
                className="btn"
                onClick={() => {
                  setTitle('新人入职流程优化')
                  setTranscript(SAMPLE)
                }}
              >
                填一段示例
              </button>
              <button className="btn ghost" onClick={() => setCreating(false)}>
                取消
              </button>
            </div>
          </div>
        ) : current ? (
          <div className="card pad">
            <div className="row">
              <div className="h2 grow">{current.title}</div>
              <CopyButton text={asText(current)} label="复制纪要" />
              <button
                className="icon-btn"
                aria-label="删除这场会议"
                onClick={() => api.del(`/meetings/${current.id}`).then(bump)}
              >
                {Icon.trash}
              </button>
            </div>
            <div className="small muted">
              {timeAgo(current.ts)}
              {current.by === 'heuristic' && ' · 按关键词整理，接入模型后会更准确'}
            </div>
            <p className="lead">{current.summary}</p>

            <div className="h3">结论</div>
            {current.conclusions.length ? (
              <ul className="bullets">
                {current.conclusions.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            ) : (
              <div className="muted">没有找到明确的结论。</div>
            )}

            <div className="h3">待办</div>
            {current.actionItems.length ? (
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 96 }}>谁来做</th>
                    <th>做什么</th>
                    <th style={{ width: 130 }}>什么时候</th>
                  </tr>
                </thead>
                <tbody>
                  {current.actionItems.map((a, i) => (
                    <tr key={i}>
                      <td>
                        <span className={'chip' + (a.owner === '我' ? ' urgent' : '')}>{a.owner}</span>
                      </td>
                      <td>{a.task}</td>
                      <td className="muted">{a.due}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="muted">没有找到明确的待办。</div>
            )}

            <button className="btn ghost sm" style={{ marginTop: 16 }} onClick={() => setShowRaw((v) => !v)}>
              {showRaw ? '收起' : '查看'}原始文字稿
            </button>
            {showRaw && <div className="pre">{current.transcript}</div>}
          </div>
        ) : (
          <div className="card">
            <Empty mood="calm" title="开完会，把文字稿交给暖暖">
              结论、待办、负责人和截止时间，它会替你理清楚。
            </Empty>
          </div>
        )}
      </div>
    </div>
  )
}
