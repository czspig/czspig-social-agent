import { useCallback, useEffect, useRef, useState } from 'react'

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch('/api' + path, {
    method,
    headers: method === 'GET' ? undefined : { 'content-type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {})
  })
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null
  if (!res.ok) throw new Error(data?.error ?? '暖暖没连上后台服务')
  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  del: <T>(path: string) => request<T>('DELETE', path)
}

export function useData<T>(path: string, version: number): { data: T | null; error: string; reload: () => void } {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [n, setN] = useState(0)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    api
      .get<T>(path)
      .then((d) => {
        if (!alive.current) return
        setData(d)
        setError('')
      })
      .catch((e: Error) => alive.current && setError(e.message))
  }, [path, version, n])
  const reload = useCallback(() => setN((x) => x + 1), [])
  return { data, error, reload }
}

export function timeAgo(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  if (mins < 24 * 60) return `${Math.round(mins / 60)} 小时前`
  const d = new Date(ts)
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

export function dueText(ts: number): { text: string; late: boolean } {
  const d = new Date(ts)
  const now = new Date()
  const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const diff = Math.floor((ts - day0) / 86400000)
  const late = ts < now.getTime()
  if (diff === 0) return { text: late ? `今天 ${hm} 已过` : `今天 ${hm} 前`, late }
  if (diff === 1) return { text: `明天 ${hm} 前`, late }
  if (diff < 0) return { text: `${d.getMonth() + 1} 月 ${d.getDate()} 日已过`, late: true }
  return { text: `周${'日一二三四五六'[d.getDay()]} ${hm} 前`, late }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}
