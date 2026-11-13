import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Settings } from '../shared/types'

export interface SecretCodec {
  encrypt(plain: string): string
  decrypt(stored: string): string
}

const plainCodec: SecretCodec = { encrypt: (s) => s, decrypt: (s) => s }

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  demoMode: true,
  userName: '',
  llmModel: 'claude-opus-5-5',
  pollSeconds: 90,
  digestTimes: ['11:00', '15:00', '18:00'],
  morningTime: '09:00',
  dndEnabled: false,
  dndStart: '14:00',
  dndEnd: '15:30',
  careEnabled: true,
  musicApp: 'netease',
  excludedChats: [],
  feishuAppId: '',
  feishuPushToSelf: true
}

export type SecretName = 'llmKey' | 'feishuSecret' | 'feishuWebhook' | 'feishuTokens'

export class Store {
  private db: DatabaseSync

  constructor(
    dataDir: string,
    private codec: SecretCodec = plainCodec
  ) {
    fs.mkdirSync(dataDir, { recursive: true })
    this.db = new DatabaseSync(path.join(dataDir, 'nuannuan.db'))
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS docs (
        coll TEXT NOT NULL, id TEXT NOT NULL, ts INTEGER NOT NULL, json TEXT NOT NULL,
        PRIMARY KEY (coll, id)
      );
      CREATE INDEX IF NOT EXISTS docs_coll_ts ON docs (coll, ts DESC);
      CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `)
  }

  id(): string {
    return randomUUID().slice(0, 12)
  }

  put<T extends { id: string; ts: number }>(coll: string, doc: T): T {
    this.db
      .prepare('INSERT OR REPLACE INTO docs (coll, id, ts, json) VALUES (?, ?, ?, ?)')
      .run(coll, doc.id, doc.ts, JSON.stringify(doc))
    return doc
  }

  get<T>(coll: string, id: string): T | null {
    const row = this.db.prepare('SELECT json FROM docs WHERE coll = ? AND id = ?').get(coll, id) as
      | { json: string }
      | undefined
    return row ? (JSON.parse(row.json) as T) : null
  }

  all<T>(coll: string, sinceTs = 0): T[] {
    const rows = this.db
      .prepare('SELECT json FROM docs WHERE coll = ? AND ts >= ? ORDER BY ts DESC')
      .all(coll, sinceTs) as { json: string }[]
    return rows.map((r) => JSON.parse(r.json) as T)
  }

  del(coll: string, id: string): void {
    this.db.prepare('DELETE FROM docs WHERE coll = ? AND id = ?').run(coll, id)
  }

  clear(coll: string): void {
    this.db.prepare('DELETE FROM docs WHERE coll = ?').run(coll)
  }

  kvGet(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    return row ? row.value : null
  }

  kvSet(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run(key, value)
  }

  kvDel(key: string): void {
    this.db.prepare('DELETE FROM kv WHERE key = ?').run(key)
  }

  settings(): Settings {
    const raw = this.kvGet('settings')
    return { ...DEFAULT_SETTINGS, ...(raw ? (JSON.parse(raw) as Partial<Settings>) : {}) }
  }

  saveSettings(patch: Partial<Settings>): Settings {
    const next = { ...this.settings(), ...patch }
    this.kvSet('settings', JSON.stringify(next))
    return next
  }

  secret(name: SecretName): string {
    const raw = this.kvGet('secret:' + name)
    if (!raw) return ''
    try {
      return this.codec.decrypt(raw)
    } catch {
      return ''
    }
  }

  setSecret(name: SecretName, value: string): void {
    if (!value) this.kvDel('secret:' + name)
    else this.kvSet('secret:' + name, this.codec.encrypt(value))
  }

  close(): void {
    this.db.close()
  }
}
