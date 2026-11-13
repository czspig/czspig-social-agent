// Stands in for src/core/feishu.ts in the web demo: never connected, never pushes.
export type { Card, CardButton, CardAction, BotCommand } from '../core/feishu'

export class Feishu {
  lastError = ''

  constructor(_store?: unknown) {}

  appReady(): boolean {
    return false
  }

  loggedIn(): boolean {
    return false
  }

  userName(): string {
    return ''
  }

  canPush(): boolean {
    return false
  }

  loginUrl(): string {
    throw new Error('网页演示版不能登录飞书，下载桌面版再接入')
  }

  async finishLogin(): Promise<string> {
    throw new Error('网页演示版不能登录飞书')
  }

  logout(): void {}

  async fetchSince(): Promise<never[]> {
    return []
  }

  async push(): Promise<void> {
    throw new Error('网页演示版不会往飞书发消息')
  }

  startBot(): void {}

  stopBot(): void {}
}
