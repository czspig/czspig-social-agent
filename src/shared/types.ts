export type Level = 'urgent' | 'normal' | 'ignore'

export interface Msg {
  id: string
  chatId: string
  chatName: string
  chatType: 'p2p' | 'group'
  senderId: string
  senderName: string
  text: string
  ts: number
  mentionsMe: boolean
  level: Level
  reason: string
  summary: string
  source: 'rule' | 'llm' | 'manual' | 'heuristic'
  score: number
  handled: boolean
  notified: boolean
  digested: boolean
  held: boolean
  snoozeUntil?: number
  suggestedReply?: string
  replyBy?: 'llm' | 'template'
}

export interface Rule {
  id: string
  kind: 'person' | 'chat' | 'keyword'
  value: string
  level: Level
  ts: number
}

export interface Todo {
  id: string
  title: string
  from: string
  due: number | null
  sourceType: 'message' | 'meeting' | 'manual'
  sourceId: string | null
  status: 'open' | 'done'
  ts: number
  doneAt: number | null
  reminded: boolean
}

export interface ActionItem {
  task: string
  owner: string
  due: string
}

export interface Meeting {
  id: string
  title: string
  ts: number
  transcript: string
  summary: string
  conclusions: string[]
  actionItems: ActionItem[]
  by: 'llm' | 'heuristic'
}

export interface ReportSource {
  type: 'message' | 'todo' | 'meeting'
  id: string
  label: string
}

export interface Report {
  id: string
  ts: number
  weekStart: number
  content: string
  sources: ReportSource[]
  by: 'llm' | 'template'
}

export interface Digest {
  id: string
  ts: number
  kind: 'digest' | 'morning'
  title: string
  lines: string[]
  msgIds: string[]
  ignoredCount: number
}

export interface Care {
  id: string
  ts: number
  text: string
  kind: string
  dismissed: boolean
}

export interface Person {
  name: string
  count: number
  chats: string[]
  lastTs: number
  note: string
  samples: string[]
}

export interface FindResult {
  matches: { name: string; score: number; why: string; evidence: string[]; note: string }[]
  draft: string
  by: 'llm' | 'template'
}

export interface Settings {
  theme: 'system' | 'light' | 'dark'
  demoMode: boolean
  userName: string
  llmModel: string
  pollSeconds: number
  digestTimes: string[]
  morningTime: string
  dndEnabled: boolean
  dndStart: string
  dndEnd: string
  careEnabled: boolean
  musicApp: 'netease' | 'qq'
  excludedChats: string[]
  feishuAppId: string
  feishuPushToSelf: boolean
}

export interface SecretStatus {
  llmKey: boolean
  feishuSecret: boolean
  feishuWebhook: boolean
  feishuLogin: boolean
  feishuUser: string
}

export interface Song {
  title: string
  artist: string
  why: string
}

export interface HomeData {
  theme: Settings['theme']
  userName: string
  demoMode: boolean
  llmReady: boolean
  feishu: SecretStatus
  quotes: string[]
  counts: { urgent: number; normal: number; ignored: number; todos: number }
  urgent: Msg[]
  song: Song
  songUrl: string
  care: Care | null
  nextDigest: string | null
  dndActive: boolean
}

export interface AppEvent {
  type: 'urgent' | 'digest' | 'morning' | 'care' | 'todo-overdue' | 'refresh'
  title?: string
  body?: string
}
