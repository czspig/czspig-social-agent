// 飞书接入。接口路径和字段按开放平台文档编写，尚未对着真实租户验证过，
// 首次接入时如遇报错，优先核对这里的 scope 名称和接口路径。
import * as Lark from '@larksuiteoapi/node-sdk'
import { randomBytes } from 'node:crypto'
import type { Store } from './db'
import type { RawMsg } from './classify'

const API = 'https://open.feishu.cn/open-apis'
const AUTHORIZE = 'https://accounts.feishu.cn/open-apis/authen/v1/authorize'
const SCOPES = ['im:message:readonly', 'im:chat:readonly', 'contact:user.base:readonly', 'offline_access']

interface Tokens {
  access: string
  refresh: string
  expiresAt: number
  openId: string
  name: string
}

export interface CardButton {
  label: string
  action: string
  primary?: boolean
}

export interface Card {
  title: string
  color: 'orange' | 'wathet' | 'green' | 'grey'
  lines: string[]
  footer?: string
  buttons?: CardButton[]
  ref?: string
}

export type CardAction = (action: string, ref: string) => Promise<string>
export type BotCommand = (text: string) => Promise<Card>

export class Feishu {
  private state = ''
  private names = new Map<string, string>()
  private tenant: { token: string; expiresAt: number } | null = null
  private ws: Lark.WSClient | null = null
  lastError = ''

  constructor(private store: Store) {}

  private tokens(): Tokens | null {
    const raw = this.store.secret('feishuTokens')
    return raw ? (JSON.parse(raw) as Tokens) : null
  }

  loggedIn(): boolean {
    return this.tokens() !== null
  }

  userName(): string {
    return this.tokens()?.name ?? ''
  }

  appReady(): boolean {
    return !!this.store.settings().feishuAppId && !!this.store.secret('feishuSecret')
  }

  loginUrl(redirectUri: string): string {
    this.state = randomBytes(12).toString('hex')
    const q = new URLSearchParams({
      client_id: this.store.settings().feishuAppId,
      redirect_uri: redirectUri,
      scope: SCOPES.join(' '),
      state: this.state
    })
    return `${AUTHORIZE}?${q.toString()}`
  }

  async finishLogin(code: string, state: string, redirectUri: string): Promise<string> {
    if (!this.state || state !== this.state) throw new Error('登录状态不匹配，请重新发起登录')
    this.state = ''
    const tok = await this.tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri })
    const info = await this.call<{ open_id: string; name: string }>('GET', '/authen/v1/user_info', tok.access)
    this.store.setSecret(
      'feishuTokens',
      JSON.stringify({ ...tok, openId: info.open_id, name: info.name } satisfies Tokens)
    )
    return info.name
  }

  logout(): void {
    this.store.setSecret('feishuTokens', '')
  }

  private async tokenRequest(extra: Record<string, string>): Promise<Omit<Tokens, 'openId' | 'name'>> {
    const res = await fetch(`${API}/authen/v2/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        client_id: this.store.settings().feishuAppId,
        client_secret: this.store.secret('feishuSecret'),
        ...extra
      })
    })
    const body = (await res.json()) as {
      code?: number
      error_description?: string
      access_token?: string
      refresh_token?: string
      expires_in?: number
    }
    if (!body.access_token) throw new Error(`飞书授权失败：${body.error_description ?? JSON.stringify(body)}`)
    return {
      access: body.access_token,
      refresh: body.refresh_token ?? '',
      expiresAt: Date.now() + (body.expires_in ?? 7200) * 1000
    }
  }

  private async userToken(): Promise<string> {
    const t = this.tokens()
    if (!t) throw new Error('还没有登录飞书')
    if (Date.now() < t.expiresAt - 5 * 60_000) return t.access
    if (!t.refresh) throw new Error('飞书登录已过期，请重新登录')
    const next = await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh })
    this.store.setSecret('feishuTokens', JSON.stringify({ ...t, ...next }))
    return next.access
  }

  private async tenantToken(): Promise<string> {
    if (this.tenant && Date.now() < this.tenant.expiresAt - 60_000) return this.tenant.token
    const res = await fetch(`${API}/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        app_id: this.store.settings().feishuAppId,
        app_secret: this.store.secret('feishuSecret')
      })
    })
    const body = (await res.json()) as { code: number; msg: string; tenant_access_token?: string; expire?: number }
    if (!body.tenant_access_token) throw new Error(`获取应用凭证失败：${body.msg}`)
    this.tenant = { token: body.tenant_access_token, expiresAt: Date.now() + (body.expire ?? 7200) * 1000 }
    return this.tenant.token
  }

  private async call<T>(method: string, path: string, token: string, body?: unknown): Promise<T> {
    const res = await fetch(API + path, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=utf-8' },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    const json = (await res.json()) as { code: number; msg: string; data?: T }
    if (json.code !== 0) throw new Error(`飞书接口 ${path.split('?')[0]} 返回 ${json.code}：${json.msg}`)
    return json.data as T
  }

  private async paged<T>(path: string, token: string, max = 500): Promise<T[]> {
    const out: T[] = []
    let pageToken = ''
    do {
      const sep = path.includes('?') ? '&' : '?'
      const data = await this.call<{ items?: T[]; has_more?: boolean; page_token?: string }>(
        'GET',
        `${path}${sep}page_size=50${pageToken ? '&page_token=' + encodeURIComponent(pageToken) : ''}`,
        token
      )
      out.push(...(data.items ?? []))
      pageToken = data.has_more ? (data.page_token ?? '') : ''
    } while (pageToken && out.length < max)
    return out
  }

  private async nameOf(openId: string, token: string): Promise<string> {
    const hit = this.names.get(openId)
    if (hit) return hit
    let name = openId
    try {
      const data = await this.call<{ user: { name: string } }>(
        'GET',
        `/contact/v3/users/${openId}?user_id_type=open_id`,
        token
      )
      name = data.user.name
    } catch {
      name = '同事'
    }
    this.names.set(openId, name)
    return name
  }

  async fetchSince(sinceMs: number): Promise<RawMsg[]> {
    const token = await this.userToken()
    const me = this.tokens()!.openId
    const chats = await this.paged<{ chat_id: string; name: string; chat_mode?: string }>(
      '/im/v1/chats?user_id_type=open_id&sort_type=ByActiveTimeDesc',
      token,
      200
    )
    const start = Math.floor(sinceMs / 1000)
    const out: RawMsg[] = []
    this.lastError = ''
    for (const chat of chats) {
      try {
        const items = await this.paged<FeishuMessage>(
          `/im/v1/messages?container_id_type=chat&container_id=${chat.chat_id}&start_time=${start}&sort_type=ByCreateTimeAsc`,
          token,
          100
        )
        for (const it of items) {
          if (it.deleted || it.sender?.sender_type !== 'user' || it.sender.id === me) continue
          const mentions = it.mentions ?? []
          out.push({
            id: it.message_id,
            chatId: chat.chat_id,
            chatName: chat.name || '私聊',
            chatType: chat.chat_mode === 'p2p' ? 'p2p' : 'group',
            senderId: it.sender.id,
            senderName: await this.nameOf(it.sender.id, token),
            text: plainText(it, mentions),
            ts: Number(it.create_time),
            mentionsMe: mentions.some((m) => m.id === me) || /@_all/.test(it.body?.content ?? '')
          })
        }
      } catch (e) {
        this.lastError = (e as Error).message
      }
    }
    return out.sort((a, b) => a.ts - b.ts)
  }

  private cardJson(card: Card, interactive: boolean): Record<string, unknown> {
    const elements: Record<string, unknown>[] = [
      { tag: 'div', text: { tag: 'lark_md', content: card.lines.join('\n') } }
    ]
    if (interactive && card.buttons?.length) {
      elements.push({
        tag: 'action',
        actions: card.buttons.map((b) => ({
          tag: 'button',
          text: { tag: 'plain_text', content: b.label },
          type: b.primary ? 'primary' : 'default',
          value: { action: b.action, ref: card.ref ?? '' }
        }))
      })
    }
    if (card.footer) {
      elements.push({ tag: 'hr' }, { tag: 'note', elements: [{ tag: 'plain_text', content: card.footer }] })
    }
    return {
      config: { wide_screen_mode: true },
      header: { template: card.color, title: { tag: 'plain_text', content: card.title } },
      elements
    }
  }

  canPush(): boolean {
    const s = this.store.settings()
    return (s.feishuPushToSelf && this.appReady() && this.loggedIn()) || !!this.store.secret('feishuWebhook')
  }

  async push(card: Card): Promise<void> {
    const s = this.store.settings()
    const t = this.tokens()
    if (s.feishuPushToSelf && this.appReady() && t) {
      await this.call('POST', '/im/v1/messages?receive_id_type=open_id', await this.tenantToken(), {
        receive_id: t.openId,
        msg_type: 'interactive',
        content: JSON.stringify(this.cardJson(card, true))
      })
      return
    }
    const hook = this.store.secret('feishuWebhook')
    if (!hook) return
    const res = await fetch(hook, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ msg_type: 'interactive', card: this.cardJson(card, false) })
    })
    const body = (await res.json()) as { code?: number; msg?: string }
    if (body.code) throw new Error(`飞书机器人返回 ${body.code}：${body.msg}`)
  }

  startBot(onAction: CardAction, onCommand: BotCommand): void {
    this.stopBot()
    if (!this.appReady()) return
    const s = this.store.settings()
    const dispatcher = new Lark.EventDispatcher({}).register({
      'im.message.receive_v1': async (data: { message: { chat_type: string; content: string }; sender: { sender_id?: { open_id?: string } } }) => {
        const me = this.tokens()?.openId
        if (data.message.chat_type !== 'p2p' || !me || data.sender.sender_id?.open_id !== me) return
        let text = ''
        try {
          text = (JSON.parse(data.message.content) as { text?: string }).text ?? ''
        } catch {
          text = ''
        }
        await this.push(await onCommand(text.trim()))
      },
      'card.action.trigger': async (data: { action?: { value?: { action?: string; ref?: string } } }) => {
        const v = data.action?.value ?? {}
        const toast = await onAction(v.action ?? '', v.ref ?? '')
        return { toast: { type: 'success', content: toast } }
      }
    } as never)
    this.ws = new Lark.WSClient({
      appId: s.feishuAppId,
      appSecret: this.store.secret('feishuSecret'),
      loggerLevel: Lark.LoggerLevel.error
    })
    void this.ws.start({ eventDispatcher: dispatcher })
  }

  stopBot(): void {
    try {
      ;(this.ws as unknown as { close?: () => void } | null)?.close?.()
    } catch {
      /* 连接可能已经断开 */
    }
    this.ws = null
  }
}

interface FeishuMessage {
  message_id: string
  msg_type: string
  create_time: string
  deleted?: boolean
  sender?: { id: string; sender_type: string }
  body?: { content: string }
  mentions?: { key: string; id: string; name: string }[]
}

function plainText(it: FeishuMessage, mentions: { key: string; name: string }[]): string {
  let content: Record<string, unknown> = {}
  try {
    content = JSON.parse(it.body?.content ?? '{}') as Record<string, unknown>
  } catch {
    return ''
  }
  let text = ''
  if (it.msg_type === 'text') text = String(content.text ?? '')
  else if (it.msg_type === 'post') {
    const rows = (content.content as { tag: string; text?: string }[][] | undefined) ?? []
    text = [content.title, ...rows.map((r) => r.map((n) => n.text ?? '').join(''))].filter(Boolean).join('\n')
  } else if (it.msg_type === 'image') text = '[图片]'
  else if (it.msg_type === 'file') text = '[文件]'
  else if (it.msg_type === 'sticker') text = '[表情]'
  else text = `[${it.msg_type}]`
  for (const m of mentions) text = text.split(m.key).join('@' + m.name)
  return text.trim()
}
