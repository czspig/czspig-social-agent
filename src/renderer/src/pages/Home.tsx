import { useEffect, useState, type ReactElement } from 'react'
import type { HomeData } from '../../../shared/types'
import { api, useData } from '../api'
import { HeroScene, Icon, Pig, StatArt, Vinyl } from '../art'
import { Empty, MsgRow, useApp } from '../ui'

type Slot = 'morning' | 'noon' | 'afternoon' | 'evening' | 'night'

function slotNow(): Slot {
  const h = new Date().getHours()
  if (h >= 5 && h < 11) return 'morning'
  if (h >= 11 && h < 14) return 'noon'
  if (h >= 14 && h < 18) return 'afternoon'
  if (h >= 18 && h < 22) return 'evening'
  return 'night'
}

const HELLO: Record<Slot, string> = {
  morning: '早上好',
  noon: '中午好',
  afternoon: '下午好',
  evening: '晚上好',
  night: '夜深了'
}

const TAIL: Record<Slot, string> = {
  morning: '今天也慢慢来',
  noon: '记得好好吃饭',
  afternoon: '今天辛苦了',
  evening: '可以松口气了',
  night: '早点休息'
}

const DEFAULT_CARE: Record<Slot, string> = {
  morning: '我已经在盯着消息了，你先安心开始今天的事。',
  noon: '消息我看着，你先好好吃饭。',
  afternoon: '有要紧的我会马上叫你，其余的不用分心。',
  evening: '今天差不多了，剩下不急的明天再说也行。',
  night: '这么晚还在忙，辛苦了。有急事我会叫你，没有就早点睡。'
}

function Quotes({ quotes }: { quotes: string[] }): ReactElement {
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (paused || quotes.length < 2) return
    const t = setInterval(() => setI((x) => (x + 1) % quotes.length), 7000)
    return () => clearInterval(t)
  }, [paused, quotes.length])
  const idx = i % Math.max(1, quotes.length)
  return (
    <div className="quote" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <span className="quote-mark" aria-hidden="true">
        “
      </span>
      <p className="quote-text" key={idx} aria-live="polite">
        {quotes[idx]}
      </p>
      <div className="quote-foot">
        <div className="quote-dots">
          {quotes.map((_, n) => (
            <button key={n} className={'quote-dot' + (n === idx ? ' on' : '')} aria-label={`第 ${n + 1} 句`} onClick={() => setI(n)} />
          ))}
        </div>
        <span className="grow" />
        <span className="small muted">今日小语</span>
        <button className="icon-btn" aria-label="上一句" onClick={() => setI((x) => (x - 1 + quotes.length) % quotes.length)}>
          {Icon.left}
        </button>
        <button className="icon-btn" aria-label="下一句" onClick={() => setI((x) => (x + 1) % quotes.length)}>
          {Icon.right}
        </button>
      </div>
    </div>
  )
}

export default function Home(): ReactElement | null {
  const { version, bump, go, say } = useApp()
  const { data } = useData<HomeData>('/home', version)
  const [busy, setBusy] = useState(false)
  if (!data) return null
  const slot = slotNow()
  const now = new Date()
  const date = `${now.getMonth() + 1} 月 ${now.getDate()} 日 · 周${'日一二三四五六'[now.getDay()]}`
  const c = data.counts

  const digestNow = async (): Promise<void> => {
    setBusy(true)
    try {
      await api.post('/digests/run')
      bump()
      go('messages', 'digests')
    } catch (e) {
      say('没有成功', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-text">
          <div className="hero-date">{date}</div>
          <h1 className="hero-hello">
            {HELLO[slot]}
            {data.userName ? `，${data.userName}` : ''}，{TAIL[slot]}
          </h1>
          <p className="hero-status">
            {c.urgent > 0 ? (
              <>
                现在有 <b>{c.urgent} 条消息</b>需要你看一眼，其余的暖暖先替你看着。
              </>
            ) : c.normal > 0 ? (
              <>眼下没有急事。有 {c.normal} 条不急的，暖暖攒着晚点一起告诉你。</>
            ) : (
              <>眼下没有需要你处理的消息，可以专心做手上的事。</>
            )}
          </p>
          <Quotes quotes={data.quotes} />
        </div>
        <HeroScene slot={slot} />
      </section>

      <section className="stats">
        <button className="stat s-urgent" onClick={() => go('messages', 'urgent')}>
          <div className="stat-label">需要你现在看</div>
          <div className="stat-num">{c.urgent}</div>
          <div className="stat-hint">{c.urgent ? '点开看看是谁在等你' : '没有人在催你'}</div>
          <StatArt kind="urgent" />
        </button>
        <button className="stat s-normal" onClick={() => go('messages', 'normal')}>
          <div className="stat-label">晚点汇总给你</div>
          <div className="stat-num">{c.normal}</div>
          <div className="stat-hint">{data.nextDigest ? `下一次简报在 ${data.nextDigest}` : '今天的简报都发完了'}</div>
          <StatArt kind="normal" />
        </button>
        <button className="stat s-ignore" onClick={() => go('messages', 'ignore')}>
          <div className="stat-label">今天已替你挡下</div>
          <div className="stat-num">{c.ignored}</div>
          <div className="stat-hint">通知、闲聊和客气话</div>
          <StatArt kind="ignore" />
        </button>
      </section>

      <section className="home-grid">
        <div className="card">
          <div className="card-title" style={{ padding: '16px 18px 0', margin: 0 }}>
            需要你现在看
            <span className="grow" />
            {data.dndActive && <span className="chip sky">免打扰中</span>}
          </div>
          {data.urgent.length ? (
            data.urgent.map((m) => <MsgRow key={m.id} m={m} />)
          ) : (
            <Empty title="没有急事，安心做手上的事吧">有要紧的消息，暖暖会第一时间叫你。</Empty>
          )}
        </div>

        <div className="stack">
          <div className="card pad">
            <div className="care">
              <Pig size={52} mood={data.care ? 'care' : 'calm'} float />
              <div className="bubble">
                {data.care ? data.care.text : DEFAULT_CARE[slot]}
                {data.care && (
                  <button className="icon-btn" aria-label="知道了" onClick={() => api.post(`/care/${data.care!.id}/dismiss`).then(bump)}>
                    {Icon.close}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="card pad">
            <div className="card-title">今天想让你听</div>
            <div className="song">
              <Vinyl />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="song-title">{data.song.title}</div>
                <div className="small muted">{data.song.artist}</div>
                <div className="song-why">{data.song.why}</div>
              </div>
              <a className="btn sm" href={data.songUrl} target="_blank" rel="noreferrer" aria-label={`去听${data.song.title}`}>
                {Icon.play}去听
              </a>
            </div>
          </div>

          <div className="card pad">
            <div className="card-title">不急的那些</div>
            <div className="row">
              <div style={{ flex: 1 }}>
                {c.normal ? `攒了 ${c.normal} 条，` : '暂时没有攒下的消息，'}
                {data.nextDigest ? `${data.nextDigest} 一起告诉你。` : '明天再汇总。'}
              </div>
              <button className="btn sm" disabled={busy || !c.normal} onClick={digestNow}>
                现在就看
              </button>
            </div>
            <div className="small muted" style={{ marginTop: 8 }}>
              还有 {c.todos} 件待办。
              <a href="#" onClick={(e) => (e.preventDefault(), go('todos'))} style={{ color: 'var(--clay-deep)' }}>
                去看看
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
