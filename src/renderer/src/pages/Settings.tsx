import { useEffect, useState, type ReactElement, type ReactNode } from 'react'
import type { Level, Rule, SecretStatus, Settings as S } from '../../../shared/types'
import { api, useData } from '../api'
import { Icon, Pig } from '../art'
import { LEVEL_NAME, Switch, useApp } from '../ui'

interface View {
  settings: S
  secrets: SecretStatus
  redirectUri: string
  lastError: string
  canPush: boolean
}

function Field({ label, help, children }: { label: string; help?: ReactNode; children: ReactNode }): ReactElement {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      <div>{children}</div>
      {help && <div className="field-help">{help}</div>}
    </div>
  )
}

function Section({ title, sub, children }: { title: string; sub?: string; children: ReactNode }): ReactElement {
  return (
    <section className="card pad">
      <div className="h2">{title}</div>
      {sub && (
        <p className="muted" style={{ margin: '0 0 10px' }}>
          {sub}
        </p>
      )}
      {children}
    </section>
  )
}

const KIND_NAME: Record<Rule['kind'], string> = { person: '这个人', chat: '这个会话', keyword: '包含这个词' }

export default function Settings(): ReactElement | null {
  const { version, bump, say } = useApp()
  const { data, reload } = useData<View>('/settings', version)
  const rules = useData<Rule[]>('/rules', version)
  const [s, setS] = useState<S | null>(null)
  const [llmKey, setLlmKey] = useState('')
  const [fsSecret, setFsSecret] = useState('')
  const [hook, setHook] = useState('')
  const [rule, setRule] = useState<{ kind: Rule['kind']; value: string; level: Level }>({ kind: 'person', value: '', level: 'urgent' })
  const [exclude, setExclude] = useState('')

  useEffect(() => {
    if (data && !s) setS(data.settings)
  }, [data, s])
  if (!data || !s) return null

  const save = async (patch: Partial<S>, secrets?: Record<string, string>): Promise<void> => {
    const next = { ...s, ...patch }
    setS(next)
    try {
      const v = await api.post<View>('/settings', { settings: patch, secrets })
      setS(v.settings)
      reload()
      bump()
    } catch (e) {
      say('没有保存成功', (e as Error).message)
    }
  }
  const text = (key: keyof S, placeholder = '', width = 220): ReactElement => (
    <input
      className="input"
      style={{ width }}
      placeholder={placeholder}
      value={String(s[key] ?? '')}
      onChange={(e) => setS({ ...s, [key]: e.target.value })}
      onBlur={(e) => e.target.value !== String(data.settings[key] ?? '') && save({ [key]: e.target.value } as Partial<S>)}
    />
  )
  const time = (key: 'morningTime' | 'dndStart' | 'dndEnd'): ReactElement => (
    <input className="input" type="time" style={{ width: 120 }} value={s[key]} onChange={(e) => e.target.value && save({ [key]: e.target.value })} />
  )

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">设置</h1>
          <p className="page-sub">告诉暖暖你的习惯，它会照着来。改动会自动保存。</p>
        </div>
      </div>

      <div className="settings">
        {s.demoMode && (
          <div className="note row">
            <Pig size={34} mood="happy" />
            <span>现在是演示模式，看到的消息都是示例。接好飞书后，在最下面关掉演示模式就会读取真实消息。</span>
          </div>
        )}
        {data.lastError && <div className="note err">最近一次出错：{data.lastError}</div>}

        <Section title="关于你">
          <Field label="怎么称呼你" help="用在问候里，也用来认出会议里分给你的事。">
            {text('userName', '你的名字')}
          </Field>
        </Section>

        <Section title="提醒的节奏" sub="要紧的消息会立刻提醒；不急的按下面的时间攒成简报。">
          <Field label="消息简报" help="每到一个时间点汇总一次。">
            <div className="row wrap">
              {s.digestTimes.map((t) => (
                <span key={t} className="chip normal">
                  {t}
                  <button
                    className="icon-btn"
                    style={{ width: 18, height: 18 }}
                    aria-label={`删除 ${t}`}
                    onClick={() => save({ digestTimes: s.digestTimes.filter((x) => x !== t) })}
                  >
                    {Icon.close}
                  </button>
                </span>
              ))}
              <input
                className="input"
                type="time"
                style={{ width: 120 }}
                aria-label="添加简报时间"
                onBlur={(e) => {
                  const v = e.target.value
                  if (v && !s.digestTimes.includes(v)) save({ digestTimes: [...s.digestTimes, v].sort() })
                  e.target.value = ''
                }}
              />
            </div>
          </Field>
          <Field label="每日早报">{time('morningTime')}</Field>
          <Field label="多久看一次飞书" help="最短 30 秒。演示模式下固定为 40 秒来一条示例消息。">
            <div className="row">
              <input
                className="input"
                type="number"
                min={30}
                max={900}
                style={{ width: 100 }}
                value={s.pollSeconds}
                onChange={(e) => setS({ ...s, pollSeconds: Number(e.target.value) })}
                onBlur={() => save({ pollSeconds: Math.min(900, Math.max(30, s.pollSeconds || 90)) })}
              />
              <span className="muted">秒</span>
            </div>
          </Field>
          <Field label="免打扰时段" help="这段时间里只放行最要紧的消息，其余的等结束后一起告诉你。">
            <div className="row wrap">
              <Switch on={s.dndEnabled} onChange={(v) => save({ dndEnabled: v })} label="免打扰" />
              {time('dndStart')}
              <span className="muted">到</span>
              {time('dndEnd')}
            </div>
          </Field>
        </Section>

        <Section title="分级规则" sub="你在消息页纠正暖暖时，规则会自动加到这里。也可以直接添加。">
          {rules.data?.map((r) => (
            <div key={r.id} className="row" style={{ padding: '7px 0', borderBottom: '1px dashed var(--line)' }}>
              <span className="muted" style={{ width: 92 }}>
                {KIND_NAME[r.kind]}
              </span>
              <span style={{ fontWeight: 600 }}>{r.value}</span>
              <span className="grow" />
              <span className={'chip ' + r.level}>{LEVEL_NAME[r.level]}</span>
              <button className="icon-btn" aria-label="删除规则" onClick={() => api.del(`/rules/${r.id}`).then(bump)}>
                {Icon.trash}
              </button>
            </div>
          ))}
          {rules.data && !rules.data.length && <div className="muted small">还没有规则，暖暖目前按通用的判断来。</div>}
          <div className="row wrap" style={{ marginTop: 14 }}>
            <select className="select" style={{ width: 130 }} value={rule.kind} onChange={(e) => setRule({ ...rule, kind: e.target.value as Rule['kind'] })}>
              <option value="person">某个人</option>
              <option value="chat">某个群或会话</option>
              <option value="keyword">包含某个词</option>
            </select>
            <input className="input" style={{ width: 180 }} placeholder="名字、群名或关键词" value={rule.value} onChange={(e) => setRule({ ...rule, value: e.target.value })} />
            <select className="select" style={{ width: 120 }} value={rule.level} onChange={(e) => setRule({ ...rule, level: e.target.value as Level })}>
              <option value="urgent">要马上看</option>
              <option value="normal">晚点汇总</option>
              <option value="ignore">不用看</option>
            </select>
            <button
              className="btn"
              disabled={!rule.value.trim()}
              onClick={() =>
                api
                  .post('/rules', rule)
                  .then(() => {
                    setRule({ ...rule, value: '' })
                    bump()
                  })
                  .catch((e: Error) => say('没有成功', e.message))
              }
            >
              {Icon.plus}添加
            </button>
          </div>
        </Section>

        <Section title="不想让暖暖读的会话" sub="这些会话的消息不会被分析，也不会发给模型。">
          <div className="row wrap">
            {s.excludedChats.map((c) => (
              <span key={c} className="chip">
                {c}
                <button className="icon-btn" style={{ width: 18, height: 18 }} aria-label={`移除 ${c}`} onClick={() => save({ excludedChats: s.excludedChats.filter((x) => x !== c) })}>
                  {Icon.close}
                </button>
              </span>
            ))}
            <input className="input" style={{ width: 200 }} placeholder="群名或对方的名字" value={exclude} onChange={(e) => setExclude(e.target.value)} />
            <button
              className="btn"
              disabled={!exclude.trim()}
              onClick={() => {
                save({ excludedChats: [...new Set([...s.excludedChats, exclude.trim()])] })
                setExclude('')
              }}
            >
              {Icon.plus}添加
            </button>
          </div>
        </Section>

        <Section title="外观">
          <Field label="明暗" help="跟随系统时，电脑切到深色模式，暖暖猪也会跟着变。">
            <div className="tabs">
              {(
                [
                  ['system', '跟随系统'],
                  ['light', '浅色'],
                  ['dark', '深色']
                ] as const
              ).map(([k, label]) => (
                <button key={k} className={'tab' + (s.theme === k ? ' on' : '')} onClick={() => save({ theme: k })}>
                  {label}
                </button>
              ))}
            </div>
          </Field>
        </Section>

        <Section title="关心和音乐">
          <Field label="偶尔关心一下" help="一天最多三次，只在合适的时候出现，比如连续忙了两小时、到饭点、周五傍晚。">
            <Switch on={s.careEnabled} onChange={(v) => save({ careEnabled: v })} label="关心提醒" />
          </Field>
          <Field label="用哪个音乐 App 打开">
            <select className="select" style={{ width: 160 }} value={s.musicApp} onChange={(e) => save({ musicApp: e.target.value as S['musicApp'] })}>
              <option value="netease">网易云音乐</option>
              <option value="qq">QQ 音乐</option>
            </select>
          </Field>
        </Section>

        <Section title="模型" sub="接入后，拿不准的消息会交给模型判断，回复、纪要和周报也会更自然。不接也能用，只是按规则和固定句式来。">
          <Field label="Claude API 密钥" help={data.secrets.llmKey ? '已经配置好了。输入新的会替换掉旧的。' : '密钥只保存在这台电脑上。'}>
            <div className="row">
              <input className="input" type="password" autoComplete="off" placeholder={data.secrets.llmKey ? '已保存' : 'sk-ant-…'} value={llmKey} onChange={(e) => setLlmKey(e.target.value)} />
              <button className="btn" disabled={!llmKey.trim()} onClick={() => save({}, { llmKey }).then(() => setLlmKey(''))}>
                保存
              </button>
              {data.secrets.llmKey && (
                <button className="btn ghost" onClick={() => save({}, { llmKey: '' })}>
                  清除
                </button>
              )}
            </div>
          </Field>
          <Field label="使用的模型" help="默认是 claude-opus-5-5。消息很多、想省一些的话，可以改成 claude-haiku-5-5。">
            {text('llmModel', 'claude-opus-5-5', 240)}
          </Field>
        </Section>

        <Section title="飞书" sub="需要一个你自己在飞书开放平台创建的应用。读取消息的权限要由企业管理员批准。">
          <Field label="连接状态">
            <div className="row wrap">
              <span className={'chip ' + (data.secrets.feishuLogin ? 'ignore' : '')}>
                {data.secrets.feishuLogin ? `已登录：${data.secrets.feishuUser}` : '还没有登录'}
              </span>
              {data.secrets.feishuLogin ? (
                <button className="btn sm" onClick={() => api.post('/feishu/logout').then(reload)}>
                  退出登录
                </button>
              ) : (
                <button
                  className="btn sm primary"
                  onClick={() =>
                    api
                      .get<{ url: string }>('/feishu/login')
                      .then((r) => window.open(r.url, '_blank'))
                      .catch((e: Error) => say('还不能登录', e.message))
                  }
                >
                  用飞书登录
                </button>
              )}
            </div>
          </Field>
          <Field label="App ID">{text('feishuAppId', 'cli_…', 260)}</Field>
          <Field label="App Secret" help={data.secrets.feishuSecret ? '已经保存。' : undefined}>
            <div className="row">
              <input className="input" type="password" autoComplete="off" placeholder={data.secrets.feishuSecret ? '已保存' : '应用凭证里的 App Secret'} value={fsSecret} onChange={(e) => setFsSecret(e.target.value)} />
              <button className="btn" disabled={!fsSecret.trim()} onClick={() => save({}, { feishuSecret: fsSecret }).then(() => setFsSecret(''))}>
                保存
              </button>
            </div>
          </Field>
          <Field label="重定向地址" help="把它填到飞书应用的「安全设置 → 重定向 URL」里。">
            <code>{data.redirectUri}</code>
          </Field>
          <Field label="提醒发到哪里" help="开着时，提醒由应用机器人私聊发给你，卡片上的按钮可以用。">
            <Switch on={s.feishuPushToSelf} onChange={(v) => save({ feishuPushToSelf: v })} label="由应用机器人私聊提醒" />
          </Field>
          <Field label="群机器人 webhook" help="备选方式：只能单向推送，卡片上没有按钮。">
            <div className="row">
              <input className="input" type="password" autoComplete="off" placeholder={data.secrets.feishuWebhook ? '已保存' : 'https://open.feishu.cn/open-apis/bot/v2/hook/…'} value={hook} onChange={(e) => setHook(e.target.value)} />
              <button className="btn" disabled={!hook.trim()} onClick={() => save({}, { feishuWebhook: hook }).then(() => setHook(''))}>
                保存
              </button>
            </div>
          </Field>
          <div className="row" style={{ marginTop: 12 }}>
            <button
              className="btn"
              disabled={!data.canPush}
              onClick={() =>
                api
                  .post('/feishu/test')
                  .then(() => say('发出去了', '去飞书看看有没有收到暖暖的招呼。'))
                  .catch((e: Error) => say('没有发成功', e.message))
              }
            >
              发一条测试消息到飞书
            </button>
            {!data.canPush && <span className="small muted">登录飞书或填好 webhook 后可用</span>}
          </div>
        </Section>

        <Section title="演示模式">
          <Field label="使用示例消息" help="关掉后会清空示例数据，开始读取真实的飞书消息。">
            <Switch
              on={s.demoMode}
              onChange={(v) => {
                if (!v && !data.secrets.feishuLogin) return say('先连上飞书', '登录飞书之后再关掉演示模式，不然就没有消息可看了。')
                save({ demoMode: v })
              }}
              label="演示模式"
            />
          </Field>
          {s.demoMode && (
            <button className="btn" style={{ marginTop: 10 }} onClick={() => api.post('/demo/reset').then(() => (bump(), say('示例数据已重置')))}>
              重置示例数据
            </button>
          )}
        </Section>
      </div>
    </div>
  )
}
