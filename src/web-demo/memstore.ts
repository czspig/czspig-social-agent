import type { Settings } from '../shared/types'
import { DEFAULT_SETTINGS, type SecretName } from '../core/defaults'

const KEY = 'nuannuan-web-demo-v1'

interface Snapshot {
  docs: Record<string, Record<string, { ts: number; json: string }>>
  kv: Record<string, string>
}

/**
 * Same surface as the SQLite Store, kept in memory and mirrored to localStorage,
 * so the web demo remembers what a visitor did. Storage can be unavailable
 * (private windows, blocked site data); then it simply starts fresh each visit.
 */
export class MemStore {
  private data: Snapshot = { docs: {}, kv: {} }
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  constructor() {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) this.data = JSON.parse(raw) as Snapshot
    } catch {
      this.data = { docs: {}, kv: {} }
    }
  }

  private persist(): void {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      try {
        localStorage.setItem(KEY, JSON.stringify(this.data))
      } catch {
        /* storage full or blocked: keep running in memory */
      }
    }, 300)
  }

  wipe(): void {
    this.data = { docs: {}, kv: {} }
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
  }

  id(): string {
    return crypto.randomUUID().slice(0, 12)
  }

  private coll(name: string): Record<string, { ts: number; json: string }> {
    return (this.data.docs[name] ??= {})
  }

  put<T extends { id: string; ts: number }>(coll: string, doc: T): T {
    this.coll(coll)[doc.id] = { ts: doc.ts, json: JSON.stringify(doc) }
    this.persist()
    return doc
  }

  get<T>(coll: string, id: string): T | null {
    const row = this.coll(coll)[id]
    return row ? (JSON.parse(row.json) as T) : null
  }

  all<T>(coll: string, sinceTs = 0): T[] {
    return Object.values(this.coll(coll))
      .filter((r) => r.ts >= sinceTs)
      .sort((a, b) => b.ts - a.ts)
      .map((r) => JSON.parse(r.json) as T)
  }

  del(coll: string, id: string): void {
    delete this.coll(coll)[id]
    this.persist()
  }

  clear(coll: string): void {
    delete this.data.docs[coll]
    this.persist()
  }

  kvGet(key: string): string | null {
    return this.data.kv[key] ?? null
  }

  kvSet(key: string, value: string): void {
    this.data.kv[key] = value
    this.persist()
  }

  kvDel(key: string): void {
    delete this.data.kv[key]
    this.persist()
  }

  settings(): Settings {
    const raw = this.kvGet('settings')
    return { ...DEFAULT_SETTINGS, ...(raw ? (JSON.parse(raw) as Partial<Settings>) : {}), demoMode: true }
  }

  saveSettings(patch: Partial<Settings>): Settings {
    const next = { ...this.settings(), ...patch, demoMode: true }
    this.kvSet('settings', JSON.stringify(next))
    return next
  }

  // The web demo never stores keys or tokens.
  secret(_name: SecretName): string {
    return ''
  }

  setSecret(_name: SecretName, _value: string): void {}

  close(): void {}
}
