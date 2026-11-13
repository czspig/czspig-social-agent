import Anthropic from '@anthropic-ai/sdk'
import type { Store } from './db'

export class LlmUnavailable extends Error {}

export class Llm {
  constructor(private store: Store) {}

  private key(): string {
    return this.store.secret('llmKey') || process.env.ANTHROPIC_API_KEY || ''
  }

  ready(): boolean {
    return this.key() !== ''
  }

  private client(): Anthropic {
    const apiKey = this.key()
    if (!apiKey) throw new LlmUnavailable('没有配置模型密钥')
    return new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 })
  }

  async text(system: string, user: string, effort: 'low' | 'medium' | 'high' = 'medium'): Promise<string> {
    const res = await this.client().messages.create({
      model: this.store.settings().llmModel,
      max_tokens: 16000,
      system,
      output_config: { effort },
      messages: [{ role: 'user', content: user }]
    })
    if (res.stop_reason === 'refusal') throw new LlmUnavailable('模型拒绝了这次请求')
    return res.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim()
  }

  async json<T>(system: string, user: string, schema: Record<string, unknown>): Promise<T> {
    const res = await this.client().messages.create({
      model: this.store.settings().llmModel,
      max_tokens: 16000,
      system,
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content: user }]
    })
    if (res.stop_reason === 'refusal') throw new LlmUnavailable('模型拒绝了这次请求')
    const raw = res.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim()
    return JSON.parse(raw) as T
  }
}

export const PERSONA =
  '你是"暖暖猪"，一个替用户盯飞书消息的个人助手，日常自称"暖暖"。' +
  '你说话温和、简短、具体，像一个靠得住的朋友。不用感叹号堆砌，不说空话，不用表情符号。'
