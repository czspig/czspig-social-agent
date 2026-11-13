import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AppEvent, Msg, Rule, Todo } from '../shared/types'
import { heuristic, type RawMsg } from './classify'
import { heuristicMinutes, parseDue, templateReply } from './writers'
import { quotesFor, songFor } from './content'
import { DEMO_TRANSCRIPT } from './demo'
import { Store } from './db'
import { Llm } from './llm'
import { Feishu } from './feishu'
import { Engine } from './engine'

const raw = (over: Partial<RawMsg>): RawMsg => ({
  id: 'm' + Math.random(),
  chatId: 'c1',
  chatName: '项目群',
  chatType: 'group',
  senderId: 'u1',
  senderName: '王磊',
  text: '',
  ts: Date.now(),
  mentionsMe: false,
  ...over
})

test('分级：私聊加时限算紧急，群里闲聊忽略，道谢忽略', () => {
  assert.equal(heuristic(raw({ chatType: 'p2p', text: '结论今天下午 5 点前能给我吗？' }), [], 0, []).level, 'urgent')
  assert.equal(heuristic(raw({ text: '中午一起吃饭吗' }), [], 0, []).level, 'ignore')
  assert.equal(heuristic(raw({ chatType: 'p2p', text: '用例写得挺细的，谢谢' }), [], 0, []).level, 'ignore')
  assert.equal(heuristic(raw({ chatType: 'p2p', text: '方便的时候帮我看一下口径问题' }), [], 0, []).level, 'normal')
  assert.equal(heuristic(raw({ mentionsMe: true, text: '线上回调大量报错，麻烦马上看一下' }), [], 0, []).level, 'urgent')
})

test('分级：追问会升级，用户规则优先，排除的会话不读', () => {
  const nudge = raw({ chatType: 'p2p', text: '在吗？那个比较急' })
  assert.equal(heuristic(nudge, [], 1, []).level, 'urgent')
  const rule: Rule = { id: 'r', kind: 'person', value: '王磊', level: 'ignore', ts: 0 }
  const v = heuristic(raw({ chatType: 'p2p', text: '紧急！马上回我' }), [rule], 0, [])
  assert.equal(v.level, 'ignore')
  assert.equal(v.source, 'rule')
  assert.equal(heuristic(raw({ chatType: 'p2p', text: '紧急！马上回我' }), [], 0, ['项目群']).level, 'ignore')
})

test('截止时间解析', () => {
  const base = new Date(2026, 10, 12, 10, 0).getTime()
  const at = (s: string): string | null => {
    const t = parseDue(s, base)
    return t ? new Date(t).toLocaleString('sv-SE').slice(0, 16) : null
  }
  assert.equal(at('今天下午 5 点前能给我吗'), '2026-11-12 17:00')
  assert.equal(at('明天下班前给我'), '2026-11-13 18:00')
  assert.equal(at('周五前回我就行'), '2026-11-13 18:00')
  assert.equal(at('下周一之前上线'), '2026-11-16 18:00')
  assert.equal(at('这周内帮我确认一下'), '2026-11-13 18:00')
  assert.equal(at('明天评审会的时间需要你确认'), null)
  assert.equal(at('有空看一下'), null)
})

test('会议纪要：提取结论、负责人和时间', () => {
  const m = heuristicMinutes(DEMO_TRANSCRIPT, '')
  assert.equal(m.conclusions.length, 2)
  assert.deepEqual(
    m.actionItems.map((a) => a.owner),
    ['李娜', '刘洋', '我']
  )
  assert.equal(m.actionItems[2].task, '把对外说明文档发给王磊')
  assert.equal(m.actionItems[0].due, '周四之前')
})

test('语录和歌曲：每天稳定、不重复', () => {
  const d = new Date(2026, 10, 12, 9, 0)
  const q = quotesFor(d)
  assert.equal(q.length, 6)
  assert.equal(new Set(q).size, 6)
  assert.deepEqual(q, quotesFor(d))
  assert.ok(songFor(d).title)
})

test('回复模板带上对方给的时间', () => {
  const m = { text: '结论今天下午 5 点前能给我吗？', ts: new Date(2026, 10, 12, 10, 0).getTime() } as Msg
  assert.match(templateReply(m), /今天 17 点前/)
})

function makeEngine(): { engine: Engine; store: Store; events: AppEvent[]; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nuannuan-'))
  const store = new Store(dir)
  store.saveSettings({ demoMode: false })
  const events: AppEvent[] = []
  const engine = new Engine(store, new Llm(store), new Feishu(store), (e) => events.push(e))
  return { engine, store, events, dir }
}

test('引擎：入库、提醒、待办和已处理的联动', async () => {
  const { engine, store, events } = makeEngine()
  const now = Date.now()
  await engine.ingest(
    [
      raw({ id: 'a', chatType: 'p2p', chatId: 'p-wang', text: '联调结论今天下班前能给我吗？', ts: now - 60_000 }),
      raw({ id: 'b', chatType: 'p2p', chatId: 'p-wang', text: '在吗？比较急', ts: now - 10_000 }),
      raw({ id: 'c', senderName: '孙浩', senderId: 'u2', text: '哈哈哈', ts: now })
    ],
    false
  )
  const msgs = store.all<Msg>('msgs')
  assert.equal(msgs.find((m) => m.id === 'a')!.level, 'urgent')
  assert.equal(msgs.find((m) => m.id === 'c')!.level, 'ignore')
  assert.equal(events.filter((e) => e.type === 'urgent').length, 2)
  const todos = store.all<Todo>('todos')
  assert.equal(todos.length, 1, '同一个人的追问不应该再生成一条待办')
  assert.ok(todos[0].due)

  await engine.ingest([raw({ id: 'a', chatType: 'p2p', text: '重复的消息' })], false)
  assert.equal(store.all<Msg>('msgs').length, 3, '同一条消息不会重复入库')

  engine.setHandled('b', true)
  assert.ok(store.all<Msg>('msgs').filter((m) => m.senderName === '王磊').every((m) => m.handled))
  assert.equal(store.all<Todo>('todos')[0].status, 'done')
  assert.equal(engine.home().counts.urgent, 0)
  store.close()
})

test('引擎：纠正分级会记住规则，并影响之后的消息', async () => {
  const { engine, store } = makeEngine()
  await engine.ingest([raw({ id: 'x', chatType: 'p2p', senderName: '张伟', senderId: 'u3', text: '排期表帮我看一下？' })], false)
  engine.setLevel('x', 'urgent', 'person')
  assert.equal(store.all<Rule>('rules')[0].value, '张伟')
  await engine.ingest([raw({ id: 'y', chatType: 'p2p', senderName: '张伟', senderId: 'u3', text: '好的' })], false)
  assert.equal(store.get<Msg>('msgs', 'y')!.level, 'urgent')
  store.close()
})

test('引擎：免打扰时压住普通紧急消息，简报汇总不急的消息', async () => {
  const { engine, store, events } = makeEngine()
  store.saveSettings({ dndEnabled: true, dndStart: '00:00', dndEnd: '23:59' })
  await engine.ingest([raw({ id: 'h', chatType: 'p2p', text: '今天下班前给我可以吗？' })], false)
  assert.equal(store.get<Msg>('msgs', 'h')!.held, true)
  assert.equal(events.filter((e) => e.type === 'urgent').length, 0)

  await engine.ingest([raw({ id: 'n', chatType: 'p2p', senderName: '赵敏', senderId: 'u4', text: '方便的时候帮我看一下看板' })], false)
  const d = await engine.runDigest(false)
  assert.ok(d)
  assert.equal(d.msgIds.length, 1)
  assert.match(d.lines[0], /赵敏/)
  assert.equal(await engine.runDigest(false), null, '没有新消息时不重复发简报')
  store.close()
})

test('引擎：会议里分给我的事进入待办，周报带出处', async () => {
  const { engine, store } = makeEngine()
  await engine.addMeeting('方案评审', DEMO_TRANSCRIPT)
  const todos = store.all<Todo>('todos')
  assert.equal(todos.length, 1)
  assert.match(todos[0].title, /对外说明文档/)
  engine.setTodo(todos[0].id, 'done')
  const report = await engine.generateReport()
  assert.match(report.content, /## 本周完成/)
  assert.ok(report.sources.length >= 2)
  assert.match(report.content, /\[1\]/)
  store.close()
})

test('密钥经过编解码后才落盘', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nuannuan-'))
  const store = new Store(dir, { encrypt: (s) => 'E(' + s + ')', decrypt: (s) => s.slice(2, -1) })
  store.setSecret('llmKey', 'abc')
  assert.equal(store.kvGet('secret:llmKey'), 'E(abc)')
  assert.equal(store.secret('llmKey'), 'abc')
  store.close()
})

test('找人：按备注和聊过的内容排序，没有线索时不硬猜', async () => {
  const { engine, store } = makeEngine()
  const now = Date.now()
  await engine.ingest(
    [
      raw({ id: 'p1', senderName: '刘洋', senderId: 'u5', chatName: '支付项目群', text: '测试环境今晚十点维护，请周知', ts: now - 3000 }),
      raw({ id: 'p2', senderName: '刘洋', senderId: 'u5', chatName: '支付项目群', text: '我来加重试队列的堆积监控和告警', ts: now - 2000 }),
      raw({ id: 'p3', senderName: '何琳', senderId: 'u6', chatName: '前端协作群', text: '新版登录页的埋点方案更新了', ts: now - 1000 })
    ],
    true
  )
  engine.setNote('李娜', '测试负责人，用例和提测流程找她')
  const env = await engine.find('测试环境的数据库权限找谁开')
  assert.equal(env.matches[0].name, '刘洋')
  assert.ok(env.matches[0].evidence.length > 0)
  assert.match(env.draft, /刘洋/)
  const flow = await engine.find('提测流程怎么走')
  assert.equal(flow.matches[0].name, '李娜')
  assert.match(flow.matches[0].why, /你记过/)
  const none = await engine.find('年会抽奖的奖品谁采购')
  assert.equal(none.matches.length, 0)
  assert.equal(none.draft, '')
  assert.ok(engine.people().some((p) => p.name === '李娜' && p.count === 0), '只有备注的人也在通讯录里')
  store.close()
})
