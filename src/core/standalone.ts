import path from 'node:path'
import { startCore } from './server'

const port = Number(process.env.NUANNUAN_PORT ?? '4317')
const dataDir = process.env.NUANNUAN_DATA ?? path.resolve('data')

startCore({
  dataDir,
  port,
  staticDir: path.resolve('out/renderer'),
  devOrigins: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  onEvent: (e) => console.log(`[${e.type}] ${e.title ?? ''} ${e.body ?? ''}`)
}).then((core) => console.log(`暖暖猪核心服务已启动：http://127.0.0.1:${core.port}`))
