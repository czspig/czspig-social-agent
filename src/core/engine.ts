import type { AppEvent, Care, Digest, FindResult, HomeData, Level, Meeting, Msg, Person, Report, Rule, Todo } from '../shared/types'
import { buildPeople, findPeople, type PersonNote } from './people'
import type { Store } from './db'
import { Llm } from './llm'
import { Feishu, type Card } from './feishu'
import { heuristic, llmClassify, shortSummary, type RawMsg } from './classify'
import { CARE_TEXT, quotesFor, songFor, songUrl } from './content'
import { DEMO_TRANSCRIPT, demoHistory, demoLive } from './demo'
import { makeMinutes, makeReport, parseDue, polish, suggestReply, todoTitle, wantsAction, weekStartOf } from './writers'

const MIN = 60_000
const DAY = 86_400_000

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function dayStart(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function ago(ts: number, now: number): string {
  const mins = Math.max(1, Math.round((now - ts) / MIN))
  if (mins < 60) return `${mins} 分钟`
  if (mins < 48 * 60) return `${Math.round(mins / 60)} 小时`
  return `${Math.round(mins / 1440)} 天`
}

export class Engine {
  private timers: NodeJS.Timeout[] = []
  private busy = false
  private sessionStart = Date.now()
  private lastTick = 0
  lastError = ''

  constructor(
    readonly store: Store,
    readonly llm: Llm,
    readonly feishu: Feishu,
    private emit: (e: AppEvent) => void
  ) {}

  start(): void {
    this.seedIfEmpty()
    this.feishu.startBot(
      (action, ref) => this.cardAction(action, ref),
      (text) => this.botCommand(text)
    )
    this.timers.push(setInterval(() => void this.minute(), 20_000))
    void this.minute()
  }

  stop(): void {
    this.timers.forEach(clearInterval)
    this.timers = []
    this.feishu.stopBot()
  }

  restartBot(): void {
    this.feishu.startBot(
      (action, ref) => this.cardAction(action, ref),
      (text) => this.botCommand(text)
    )
  }

  private msgs(since = 0): Msg[] {
    return this.store.all<Msg>('msgs', since)
  }

  private todos(): Todo[] {
    return this.store.all<Todo>('todos')
  }

  private dndActive(now = new Date()): boolean {
    const s = this.store.settings()
    if (!s.dndEnabled) return false
    const t = hhmm(now)
    return s.dndStart <= s.dndEnd ? t >= s.dndStart && t < s.dndEnd : t >= s.dndStart || t < s.dndEnd
  }

  seedIfEmpty(): void {
    const s = this.store.settings()
    if (!s.demoMode || this.store.kvGet('seeded')) return
    const now = Date.now()
    void this.ingest(demoHistory(now), true).then(async () => {
      for (const m of this.msgs()) {
        if (now - m.ts > 20 * 60 * MIN && m.level !== 'ignore') this.setHandled(m.id, true, false)
        else if (m.level === 'urgent') this.store.put('msgs', { ...this.store.get<Msg>('msgs', m.id)!, notified: true })
      }
      await this.addMeeting('支付回调改造方案评审', DEMO_TRANSCRIPT, now - 2 * DAY + 3 * 60 * MIN)
      this.setNote('刘洋', '运维，管测试环境、发布窗口和监控告警')
      this.setNote('李娜', '测试负责人，用例和提测流程找她')
      this.emit({ type: 'refresh' })
    })
    this.store.kvSet('seeded', '1')
    this.store.kvSet('demoLiveIndex', '0')
  }

  resetDemo(): void {
    for (const c of ['msgs', 'todos', 'digests', 'meetings', 'reports', 'cares', 'rules', 'people']) this.store.clear(c)
    this.store.kvDel('seeded')
    this.store.kvDel('lastFetch')
    this.sessionStart = Date.now()
    this.seedIfEmpty()
  }

  private async minute(): Promise<void> {
    const now = Date.now()
    const s = this.store.settings()
    const interval = (s.demoMode ? 40 : Math.max(30, s.pollSeconds)) * 1000
    if (now - this.lastTick >= interval) {
      this.lastTick = now
      await this.tick()
    }
    this.schedule(new Date(now))
  }

  async tick(): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      const s = this.store.settings()
      const now = Date.now()
      if (s.demoMode) {
        const i = Number(this.store.kvGet('demoLiveIndex') ?? '0')
        if (i < 8 && now - this.sessionStart > 25_000) {
          this.store.kvSet('demoLiveIndex', String(i + 1))
          await this.ingest([demoLive(i, now)], false)
        }
      } else if (this.feishu.loggedIn()) {
        const since = Number(this.store.kvGet('lastFetch') ?? String(now - 12 * 60 * MIN))
        const raws = await this.feishu.fetchSince(since - 5_000)
        this.store.kvSet('lastFetch', String(now))
        await this.ingest(raws, false)
        this.lastError = this.feishu.lastError
      }
    } catch (e) {
      this.lastError = (e as Error).message
    } finally {
      this.busy = false
    }
  }

  async ingest(raws: RawMsg[], silent: boolean): Promise<void> {
    const s = this.store.settings()
    const rules = this.store.all<Rule>('rules')
    const fresh = raws.filter((r) => r.text && !this.store.get<Msg>('msgs', r.id)).sort((a, b) => a.ts - b.ts)
    if (!fresh.length) return

    const recent = this.msgs(Date.now() - 4 * DAY)
    const staged: { raw: RawMsg; msg: Msg; decisive: boolean }[] = []
    for (const raw of fresh) {
      const pool = [...recent, ...staged.map((x) => x.msg)]
      const nudges = pool.filter(
        (m) => m.senderId === raw.senderId && m.chatId === raw.chatId && !m.handled && raw.ts - m.ts < 60 * MIN && raw.ts > m.ts
      ).length
      const v = heuristic(raw, rules, nudges, s.excludedChats)
      staged.push({
        raw,
        decisive: v.decisive,
        msg: {
          ...raw,
          level: v.level,
          reason: v.reason,
          summary: shortSummary(raw.text),
          source: v.source,
          score: v.score,
          handled: false,
          notified: false,
          digested: false,
          held: false
        }
      })
    }

    const unsure = staged.filter((x) => !x.decisive)
    if (unsure.length && this.llm.ready()) {
      try {
        for (let i = 0; i < unsure.length; i += 20) {
          const batch = unsure.slice(i, i + 20)
          const verdicts = await llmClassify(this.llm, s.userName, batch.map((x) => x.raw))
          for (const x of batch) {
            const v = verdicts.get(x.raw.id)
            if (!v) continue
            x.msg.level = v.level
            x.msg.reason = v.reason
            x.msg.summary = v.summary
            x.msg.source = 'llm'
          }
        }
      } catch (e) {
        this.lastError = '模型分级失败，已改用规则判断：' + (e as Error).message
      }
    }

    for (const { msg } of staged) {
      if (silent) msg.notified = true
      this.store.put('msgs', msg)
      this.maybeTodo(msg)
      if (!silent && msg.level === 'urgent') await this.notifyUrgent(msg)
    }
    this.emit({ type: 'refresh' })
  }

  private maybeTodo(m: Msg): void {
    if (m.level === 'ignore') return
    const direct = m.chatType === 'p2p' || m.mentionsMe
    if (!direct) return
    const open = this.todos().find(
      (t) => t.status === 'open' && t.sourceType === 'message' && t.from === m.senderName && this.sameThread(t, m)
    )
    const due = parseDue(m.text, m.ts)
    if (open) {
      if (due && (!open.due || due < open.due)) this.store.put('todos', { ...open, due, reminded: false })
      return
    }
    if (!wantsAction(m.text)) return
    this.store.put<Todo>('todos', {
      id: this.store.id(),
      title: todoTitle(m),
      from: m.senderName,
      due,
      sourceType: 'message',
      sourceId: m.id,
      status: 'open',
      ts: m.ts,
      doneAt: null,
      reminded: false
    })
  }

  private sameThread(t: Todo, m: Msg): boolean {
    const src = t.sourceId ? this.store.get<Msg>('msgs', t.sourceId) : null
    return !!src && src.chatId === m.chatId && m.ts - src.ts < 6 * 60 * MIN
  }

  private urgentCard(m: Msg): Card {
    return {
      title: `${m.senderName} 找你，暖暖觉得需要现在看`,
      color: 'orange',
      lines: [
        `**${m.senderName}** · ${m.chatType === 'p2p' ? '私聊' : m.chatName}`,
        m.summary,
        `判断依据：${m.reason}`
      ],
      footer: '暖暖只提醒你，不会替你回复',
      ref: m.id,
      buttons: [
        { label: '已处理', action: 'handled', primary: true },
        { label: '半小时后再提醒', action: 'snooze' }
      ]
    }
  }

  private async notifyUrgent(m: Msg): Promise<void> {
    if (this.dndActive() && m.score < 8) {
      this.store.put('msgs', { ...m, held: true })
      return
    }
    this.store.put('msgs', { ...m, notified: true, held: false, snoozeUntil: undefined })
    this.emit({ type: 'urgent', title: `${m.senderName} 找你`, body: m.summary })
    await this.pushCard(this.urgentCard(m))
  }

  private async pushCard(card: Card): Promise<void> {
    if (this.store.settings().demoMode || !this.feishu.canPush()) return
    try {
      await this.feishu.push(card)
    } catch (e) {
      this.lastError = '推送到飞书失败：' + (e as Error).message
    }
  }

  private schedule(now: Date): void {
    const s = this.store.settings()
    const t = hhmm(now)
    const today = dayStart(now.getTime())
    const once = (key: string): boolean => {
      const stamp = `${today}:${key}`
      if (this.store.kvGet('fired:' + key) === stamp) return false
      this.store.kvSet('fired:' + key, stamp)
      return true
    }
    const due = (target: string): boolean => t >= target && t < addMinutes(target, 3)

    for (const time of s.digestTimes) if (due(time) && once('digest-' + time)) void this.runDigest(false)
    if (due(s.morningTime) && once('morning')) void this.runMorning()

    if (!this.dndActive(now)) {
      const held = this.msgs(today - DAY).filter((m) => m.held && !m.handled)
      if (held.length) {
        held.forEach((m) => this.store.put('msgs', { ...m, held: false, notified: true }))
        this.emit({
          type: 'urgent',
          title: `免打扰结束，有 ${held.length} 条要紧消息`,
          body: held.map((m) => `${m.senderName}：${m.summary}`).join('\n')
        })
        void this.pushCard({
          title: `免打扰期间，暖暖替你留了 ${held.length} 条要紧消息`,
          color: 'orange',
          lines: held.map((m) => `**${m.senderName}**：${m.summary}`)
        })
      }
      for (const m of this.msgs(today - DAY)) {
        if (m.snoozeUntil && m.snoozeUntil <= now.getTime() && !m.handled) void this.notifyUrgent(m)
      }
    }

    for (const todo of this.todos()) {
      if (todo.status !== 'open' || !todo.due || todo.reminded) continue
      const left = todo.due - now.getTime()
      if (left > 60 * MIN) continue
      this.store.put('todos', { ...todo, reminded: true })
      const title = left < 0 ? '有件事已经过了约定时间' : '有件事快到时间了'
      this.emit({ type: 'todo-overdue', title, body: todo.title })
      void this.pushCard({ title, color: 'orange', lines: [todo.title], ref: todo.id, buttons: [{ label: '已完成', action: 'todo-done', primary: true }] })
    }

    this.maybeCare(now)
  }

  private maybeCare(now: Date): void {
    if (!this.store.settings().careEnabled) return
    const today = dayStart(now.getTime())
    const cares = this.store.all<Care>('cares', today)
    if (cares.length >= 3) return
    if (cares[0] && now.getTime() - cares[0].ts < 90 * MIN) return
    const had = (k: string): boolean => cares.some((c) => c.kind === k)
    const todays = this.msgs(today)
    const h = now.getHours()
    let kind = ''
    if (h >= 21 && !had('late')) kind = 'late'
    else if (h === 12 && now.getMinutes() < 40 && !had('lunch')) kind = 'lunch'
    else if (now.getDay() === 5 && h >= 17 && h < 20 && !had('friday')) kind = 'friday'
    else if (now.getTime() - this.sessionStart >= 120 * MIN && !had('longFocus')) kind = 'longFocus'
    else if (todays.length >= 12 && !had('busyDay')) kind = 'busyDay'
    else if (
      !had('cleared') &&
      todays.some((m) => m.level === 'urgent') &&
      todays.every((m) => m.level !== 'urgent' || m.handled)
    )
      kind = 'cleared'
    if (!kind) return
    if (kind === 'longFocus') this.sessionStart = now.getTime()
    const options = CARE_TEXT[kind]
    const care: Care = {
      id: this.store.id(),
      ts: now.getTime(),
      kind,
      text: options[now.getDate() % options.length],
      dismissed: false
    }
    this.store.put('cares', care)
    this.emit({ type: 'care', title: '暖暖想对你说', body: care.text })
  }

  dismissCare(id: string): void {
    const c = this.store.get<Care>('cares', id)
    if (c) this.store.put('cares', { ...c, dismissed: true })
  }

  async runDigest(manual: boolean): Promise<Digest | null> {
    const now = Date.now()
    const pending = this.msgs(now - 3 * DAY)
      .filter((m) => m.level === 'normal' && !m.digested && !m.handled)
      .sort((a, b) => a.ts - b.ts)
    const last = this.store.all<Digest>('digests').find((d) => d.kind === 'digest')
    const ignoredCount = this.msgs(last ? last.ts : dayStart(now)).filter((m) => m.level === 'ignore').length
    if (!pending.length && !manual) return null
    pending.forEach((m) => this.store.put('msgs', { ...m, digested: true }))
    const bySender = new Map<string, Msg[]>()
    pending.forEach((m) => bySender.set(m.senderName, [...(bySender.get(m.senderName) ?? []), m]))
    const lines = [...bySender.entries()].map(([name, list]) => {
      const where = list[0].chatType === 'p2p' ? '私聊' : list[0].chatName
      return `${name}（${where}，等了 ${ago(list[0].ts, now)}）：${list.map((m) => m.summary).join('；')}`
    })
    const digest: Digest = {
      id: this.store.id(),
      ts: now,
      kind: 'digest',
      title: pending.length ? `这段时间有 ${bySender.size} 个人找过你，都不算急` : '这段时间没有需要你处理的新消息',
      lines,
      msgIds: pending.map((m) => m.id),
      ignoredCount
    }
    this.store.put('digests', digest)
    this.emit({ type: 'digest', title: '暖暖的消息简报', body: digest.title })
    await this.pushCard({
      title: '暖暖的消息简报',
      color: 'wathet',
      lines: [digest.title, ...lines.map((l) => '- ' + l)],
      footer: `另外替你挡下了 ${ignoredCount} 条不用看的消息`
    })
    return digest
  }

  async runMorning(): Promise<Digest> {
    const now = Date.now()
    const open = this.todos()
      .filter((t) => t.status === 'open')
      .sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity))
    const endOfDay = dayStart(now) + DAY
    const lines: string[] = []
    const overdue = open.filter((t) => t.due && t.due < now)
    const today = open.filter((t) => t.due && t.due >= now && t.due < endOfDay)
    const later = open.filter((t) => !t.due || t.due >= endOfDay)
    overdue.forEach((t) => lines.push(`已超期 · ${t.title}`))
    today.forEach((t) => lines.push(`今天 ${hhmm(new Date(t.due!))} 前 · ${t.title}`))
    later.slice(0, 5).forEach((t) => lines.push(`不急 · ${t.title}`))
    const hello = new Date(now).getHours() < 11 ? '早上好。' : ''
    const waiting = this.waiting()
    if (waiting.length) lines.push(`正在等你回复的人：${waiting.map((w) => `${w.name}（${ago(w.since, now)}）`).join('、')}`)
    const digest: Digest = {
      id: this.store.id(),
      ts: now,
      kind: 'morning',
      title: open.length
        ? `${hello}今天有 ${today.length + overdue.length} 件事要紧，另外 ${later.length} 件可以慢慢来`
        : `${hello}今天暂时没有待办，可以按自己的节奏来`,
      lines,
      msgIds: [],
      ignoredCount: 0
    }
    this.store.put('digests', digest)
    this.emit({ type: 'morning', title: '暖暖的早报', body: digest.title })
    await this.pushCard({ title: '暖暖的早报', color: 'green', lines: [digest.title, ...lines.map((l) => '- ' + l)] })
    return digest
  }

  waiting(): { name: string; since: number; count: number }[] {
    const map = new Map<string, { name: string; since: number; count: number }>()
    for (const m of this.msgs(Date.now() - 7 * DAY)) {
      if (m.handled || m.level === 'ignore' || !(m.chatType === 'p2p' || m.mentionsMe)) continue
      const w = map.get(m.senderName) ?? { name: m.senderName, since: m.ts, count: 0 }
      map.set(m.senderName, { name: m.senderName, since: Math.min(w.since, m.ts), count: w.count + 1 })
    }
    return [...map.values()].sort((a, b) => a.since - b.since)
  }

  setHandled(id: string, handled: boolean, cascade = true): void {
    const m = this.store.get<Msg>('msgs', id)
    if (!m) return
    const group = cascade
      ? this.msgs(m.ts - DAY).filter((x) => x.senderId === m.senderId && x.chatId === m.chatId && x.ts <= m.ts)
      : [m]
    for (const x of handled ? group : [m]) {
      this.store.put('msgs', { ...x, handled, held: false, snoozeUntil: undefined })
      for (const t of this.todos()) {
        if (t.sourceId !== x.id) continue
        this.store.put('todos', { ...t, status: handled ? 'done' : 'open', doneAt: handled ? Date.now() : null })
      }
    }
    this.emit({ type: 'refresh' })
  }

  setLevel(id: string, level: Level, remember: 'person' | 'chat' | null): Msg | null {
    const m = this.store.get<Msg>('msgs', id)
    if (!m) return null
    const next: Msg = { ...m, level, source: 'manual', reason: '你手动调整过', held: false }
    this.store.put('msgs', next)
    if (remember) this.addRule(remember, remember === 'person' ? m.senderName : m.chatName, level)
    if (level !== 'ignore') this.maybeTodo(next)
    this.emit({ type: 'refresh' })
    return next
  }

  addRule(kind: Rule['kind'], value: string, level: Level): Rule {
    const rules = this.store.all<Rule>('rules')
    rules.filter((r) => r.kind === kind && r.value === value).forEach((r) => this.store.del('rules', r.id))
    return this.store.put<Rule>('rules', { id: this.store.id(), kind, value: value.trim(), level, ts: Date.now() })
  }

  setTodo(id: string, status: Todo['status']): void {
    const t = this.store.get<Todo>('todos', id)
    if (!t) return
    this.store.put('todos', { ...t, status, doneAt: status === 'done' ? Date.now() : null })
    if (t.sourceType === 'message' && t.sourceId) {
      const m = this.store.get<Msg>('msgs', t.sourceId)
      if (m) this.store.put('msgs', { ...m, handled: status === 'done' })
    }
    this.emit({ type: 'refresh' })
  }

  addTodo(title: string, due: number | null): Todo {
    return this.store.put<Todo>('todos', {
      id: this.store.id(),
      title,
      from: '自己',
      due,
      sourceType: 'manual',
      sourceId: null,
      status: 'open',
      ts: Date.now(),
      doneAt: null,
      reminded: false
    })
  }

  async reply(id: string): Promise<Msg | null> {
    const m = this.store.get<Msg>('msgs', id)
    if (!m) return null
    const r = await suggestReply(this.llm, m, this.store.settings().userName)
    return this.store.put('msgs', { ...m, suggestedReply: r.text, replyBy: r.by })
  }

  polish(draft: string, to: string, tone: 'peer' | 'senior' | 'cross'): Promise<{ text: string; by: 'llm' | 'template' }> {
    return polish(this.llm, draft, to, tone)
  }

  async addMeeting(title: string, transcript: string, ts = Date.now()): Promise<Meeting> {
    const userName = this.store.settings().userName
    const minutes = await makeMinutes(this.llm, transcript, userName)
    const meeting = this.store.put<Meeting>('meetings', { id: this.store.id(), title, ts, transcript, ...minutes })
    const mine = new Set(['我', userName].filter(Boolean))
    for (const item of meeting.actionItems) {
      if (!mine.has(item.owner)) continue
      this.store.put<Todo>('todos', {
        id: this.store.id(),
        title: `会议「${title}」：${item.task}`,
        from: '会议',
        due: parseDue(item.due, ts),
        sourceType: 'meeting',
        sourceId: meeting.id,
        status: 'open',
        ts,
        doneAt: null,
        reminded: false
      })
    }
    this.emit({ type: 'refresh' })
    return meeting
  }

  async generateReport(): Promise<Report> {
    const now = Date.now()
    const start = weekStartOf(now)
    const todos = this.todos()
    const draft = await makeReport(this.llm, {
      userName: this.store.settings().userName,
      now,
      handled: this.msgs(start).filter((m) => m.handled),
      done: todos.filter((t) => t.status === 'done' && (t.doneAt ?? 0) >= start),
      open: todos.filter((t) => t.status === 'open'),
      meetings: this.store.all<Meeting>('meetings', start)
    })
    return this.store.put<Report>('reports', { id: this.store.id(), ts: now, ...draft })
  }

  people(): Person[] {
    return buildPeople(
      this.msgs(Date.now() - 90 * DAY),
      this.store.all<PersonNote>('people'),
      this.store.settings().excludedChats
    )
  }

  setNote(name: string, note: string): void {
    const id = name.trim()
    if (!id) return
    if (note.trim()) this.store.put<PersonNote>('people', { id, ts: Date.now(), note: note.trim() })
    else this.store.del('people', id)
  }

  find(query: string): Promise<FindResult> {
    return findPeople(this.llm, query, this.people(), this.store.settings().userName)
  }

  home(): HomeData {
    const now = new Date()
    const s = this.store.settings()
    const today = dayStart(now.getTime())
    const recent = this.msgs(today - 2 * DAY)
    const active = recent.filter((m) => !m.handled)
    const urgent = active.filter((m) => m.level === 'urgent').sort((a, b) => b.ts - a.ts)
    const song = songFor(now)
    const care = this.store.all<Care>('cares', today).find((c) => !c.dismissed) ?? null
    const t = hhmm(now)
    return {
      theme: s.theme,
      userName: s.userName,
      demoMode: s.demoMode,
      llmReady: this.llm.ready(),
      feishu: this.secretStatus(),
      quotes: quotesFor(now),
      counts: {
        urgent: urgent.length,
        normal: active.filter((m) => m.level === 'normal').length,
        ignored: this.msgs(today).filter((m) => m.level === 'ignore').length,
        todos: this.todos().filter((x) => x.status === 'open').length
      },
      urgent: urgent.slice(0, 5),
      song,
      songUrl: songUrl(song, s.musicApp),
      care,
      nextDigest: [...s.digestTimes].sort().find((x) => x > t) ?? null,
      dndActive: this.dndActive(now)
    }
  }

  secretStatus(): HomeData['feishu'] {
    return {
      llmKey: this.llm.ready(),
      feishuSecret: !!this.store.secret('feishuSecret'),
      feishuWebhook: !!this.store.secret('feishuWebhook'),
      feishuLogin: this.feishu.loggedIn(),
      feishuUser: this.feishu.userName()
    }
  }

  private async cardAction(action: string, ref: string): Promise<string> {
    if (action === 'handled') {
      this.setHandled(ref, true)
      return '好的，暖暖记下了'
    }
    if (action === 'snooze') {
      const m = this.store.get<Msg>('msgs', ref)
      if (m) this.store.put('msgs', { ...m, snoozeUntil: Date.now() + 30 * MIN })
      return '半小时后暖暖再来提醒你'
    }
    if (action === 'todo-done') {
      this.setTodo(ref, 'done')
      return '完成一件，辛苦了'
    }
    return '暖暖没看懂这个操作'
  }

  private async botCommand(text: string): Promise<Card> {
    if (/简报|汇总|消息/.test(text)) {
      const d = await this.runDigest(true)
      return { title: '暖暖的消息简报', color: 'wathet', lines: d ? [d.title, ...d.lines.map((l) => '- ' + l)] : ['暂时没有'] }
    }
    if (/待办|要做/.test(text)) {
      const open = this.todos().filter((t) => t.status === 'open')
      return {
        title: `你还有 ${open.length} 件待办`,
        color: 'green',
        lines: open.length ? open.slice(0, 10).map((t) => '- ' + t.title) : ['都清空了，歇一会儿吧']
      }
    }
    if (/紧急|要紧|急/.test(text)) {
      const urgent = this.home().urgent
      return {
        title: urgent.length ? `有 ${urgent.length} 条需要现在看` : '眼下没有急事',
        color: 'orange',
        lines: urgent.length ? urgent.map((m) => `- **${m.senderName}**：${m.summary}`) : ['你可以安心做手上的事']
      }
    }
    return {
      title: '我是暖暖猪，替你盯着飞书消息',
      color: 'grey',
      lines: ['你可以对我说：', '- **简报**：现在就汇总一次不急的消息', '- **待办**：看看还有哪些事没做', '- **紧急**：看看有没有要马上处理的']
    }
  }
}

function addMinutes(t: string, n: number): string {
  const [h, m] = t.split(':').map(Number)
  const total = Math.min(h * 60 + m + n, 23 * 60 + 59)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
