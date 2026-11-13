import type { Settings } from '../shared/types'

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
