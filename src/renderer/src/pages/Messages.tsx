import { useEffect, useState, type ReactElement } from 'react'
import type { Digest, Msg } from '../../../shared/types'
import { api, timeAgo, useData } from '../api'
import { Icon } from '../art'
import { CopyButton, Empty, MsgRow, useApp } from '../ui'

type Tab = 'urgent' | 'normal' | 'ignore' | 'handled' | 'digests' | 'polish'

const TABS: [Tab, string][] = [
  ['urgent', '要马上看'],
  ['normal', '晚点汇总'],
  ['ignore', '已挡下'],
  ['handled', '处理过的'],
  ['digests', '简报'],
  ['polish', '话术助手']
]

function Polish(): ReactElement {
  const { say } = useApp()
  const [text, setText] = useState('')
  const [to, setTo] = useState('')
  const [tone, setTone] = useState<'peer' | 'senior' | 'cross'>('cross')
  const [out, setOut] = useState<{ text: string; by: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const run = async (): Promise<void> => {
    setBusy(true)
    try {
      setOut(await api.post('/polish', { text, to, tone }))
    } catch (e) {
      say('没有成功', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="card pad stack">
      <div>
        <div className="h2">不知道怎么开口？</div>
        <p className="muted" style={{ margin: 0 }}>
          写个大意，暖暖帮你改成得体的说法。改好的话由你自己去发。
        </p>
      </div>
      <div className="row wrap">
        <input className="input" style={{ width: 250 }} placeholder="发给谁，比如：运维的老周" value={to} onChange={(e) => setTo(e.target.value)} />
        <div className="tabs">
          {(
            [
              ['cross', '跨部门'],
              ['peer', '同组同事'],
              ['senior', '向上汇报']
            ] as const
          ).map(([k, label]) => (
            <button key={k} className={'tab' + (tone === k ? ' on' : '')} onClick={() => setTone(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <textarea className="textarea" placeholder="比如：想让他帮忙开一下测试环境的数据库权限，这周要用" value={text} onChange={(e) => setText(e.target.value)} />
      <div>
        <button className="btn primary" disabled={busy || !text.trim()} onClick={run}>
          {Icon.spark}
          {busy ? '暖暖在想…' : '帮我改一改'}
        </button>
      </div>
      {out && (
        <div className="reply" style={{ marginTop: 0 }}>
          <p className="reply-text">{out.text}</p>
          <div className="row wrap">
            <CopyButton text={out.text} />
            {out.by === 'template' && <span className="small muted">现在用的是固定句式。在设置里接入模型后，改写会更自然。</span>}
          </div>
        </div>
      )}
    </div>
  )
}

function Digests({ version }: { version: number }): ReactElement {
  const { bump, say } = useApp()
  const { data } = useData<Digest[]>('/digests', version)
  const [busy, setBusy] = useState(false)
  const run = async (): Promise<void> => {
    setBusy(true)
    try {
      await api.post('/digests/run')
      bump()
    } catch (e) {
      say('没有成功', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="stack">
      <div className="row">
        <span className="muted">不急的消息，暖暖会按你设定的时间攒成一条简报。</span>
        <span className="grow" />
        <button className="btn" disabled={busy} onClick={run}>
          现在汇总一次
        </button>
      </div>
      {data && !data.length && (
        <div className="card">
          <Empty mood="sleepy" title="还没有发过简报">
            到了设定的时间，或者你点「现在汇总一次」，简报会出现在这里。
          </Empty>
        </div>
      )}
      {data?.map((d) => (
        <div key={d.id} className="card pad">
          <div className="row">
            <span className={'chip ' + (d.kind === 'morning' ? 'ignore' : 'normal')}>{d.kind === 'morning' ? '早报' : '消息简报'}</span>
            <span className="small muted">{timeAgo(d.ts)}</span>
          </div>
          <div className="lead" style={{ color: 'var(--ink)' }}>
            {d.title}
          </div>
          {d.lines.length > 0 && (
            <ul className="bullets" style={{ marginTop: 10 }}>
              {d.lines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          )}
          {d.kind === 'digest' && (
            <div className="small muted" style={{ marginTop: 10 }}>
              这段时间另外替你挡下了 {d.ignoredCount} 条不用看的消息。
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default function Messages({ arg }: { arg?: string }): ReactElement {
  const { version } = useApp()
  const [tab, setTab] = useState<Tab>((arg as Tab) || 'urgent')
  useEffect(() => {
    if (arg) setTab(arg as Tab)
  }, [arg])
  const { data } = useData<Msg[]>('/messages?days=7', version)
  const all = data ?? []
  const lists: Record<string, Msg[]> = {
    urgent: all.filter((m) => m.level === 'urgent' && !m.handled),
    normal: all.filter((m) => m.level === 'normal' && !m.handled),
    ignore: all.filter((m) => m.level === 'ignore'),
    handled: all.filter((m) => m.handled && m.level !== 'ignore')
  }
  const EMPTY: Record<string, [string, string]> = {
    urgent: ['没有急事', '有要紧的消息，暖暖会第一时间叫你。'],
    normal: ['没有攒下的消息', '不急的消息会先放在这里，到点一起告诉你。'],
    ignore: ['还没有挡下什么', '通知、闲聊和客气话会放在这里，你不用看。'],
    handled: ['这里还是空的', '你处理过的消息会留在这里，写周报时用得上。']
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">消息</h1>
          <p className="page-sub">暖暖替你把消息分好了轻重。判断得不对，随时告诉它。</p>
        </div>
      </div>
      <div className="tabs" style={{ marginBottom: 18, flexWrap: 'wrap' }}>
        {TABS.map(([k, label]) => (
          <button key={k} className={'tab' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>
            {label}
            {lists[k] && <span className="n">{lists[k].length}</span>}
          </button>
        ))}
      </div>

      {tab === 'polish' && <Polish />}
      {tab === 'digests' && <Digests version={version} />}
      {lists[tab] && (
        <div className="card">
          {lists[tab].length ? (
            lists[tab].map((m) => <MsgRow key={m.id} m={m} showLevel={tab === 'handled'} />)
          ) : (
            data && (
              <Empty mood={tab === 'urgent' ? 'happy' : 'sleepy'} title={EMPTY[tab][0]}>
                {EMPTY[tab][1]}
              </Empty>
            )
          )}
        </div>
      )}
    </div>
  )
}
