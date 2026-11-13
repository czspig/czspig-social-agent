// Stands in for src/core/llm.ts in the web demo: no key, so every caller takes its template path.
export class LlmUnavailable extends Error {}

export class Llm {
  constructor(_store?: unknown) {}

  ready(): boolean {
    return false
  }

  async text(): Promise<string> {
    throw new LlmUnavailable('网页演示版不调用模型')
  }

  async json<T>(): Promise<T> {
    throw new LlmUnavailable('网页演示版不调用模型')
  }
}

export const PERSONA =
  '你是"暖暖猪"，一个替用户盯飞书消息的个人助手，日常自称"暖暖"。' +
  '你说话温和、简短、具体，像一个靠得住的朋友。不用感叹号堆砌，不说空话，不用表情符号。'
