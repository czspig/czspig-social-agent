import { app, BrowserWindow, Menu, nativeImage, Notification, safeStorage, shell, Tray } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startCore, type Core } from '../core/server'
import type { SecretCodec } from '../core/db'

const here = path.dirname(fileURLToPath(import.meta.url))
const devUrl = process.env.ELECTRON_RENDERER_URL
const basePort = Number(process.env.NUANNUAN_PORT ?? '4317')

const resources = path.join(here, '../../resources')

let win: BrowserWindow | null = null
let core: Core | null = null
let tray: Tray | null = null
let appUrl = ''
let quitting = false
let toldAboutTray = false

function showWindow(): void {
  if (!win) return createWindow(appUrl)
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function refreshTray(): void {
  if (!tray || !core) return
  const c = core.engine.home().counts
  tray.setToolTip(c.urgent ? `暖暖猪 · 有 ${c.urgent} 条消息要马上看` : `暖暖猪 · 没有急事，攒了 ${c.normal} 条不急的`)
}

function createTray(): void {
  tray = new Tray(nativeImage.createFromPath(path.join(resources, 'tray.png')))
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开暖暖猪', click: showWindow },
      { label: '现在汇总一次不急的消息', click: () => void core?.engine.runDigest(true).then(showWindow) },
      { type: 'separator' },
      {
        label: '退出暖暖猪',
        click: () => {
          quitting = true
          app.quit()
        }
      }
    ])
  )
  tray.on('click', showWindow)
  refreshTray()
  setInterval(refreshTray, 30_000)
}

function codec(): SecretCodec | undefined {
  if (!safeStorage.isEncryptionAvailable()) return undefined
  return {
    encrypt: (plain) => 'enc:' + safeStorage.encryptString(plain).toString('base64'),
    decrypt: (stored) =>
      stored.startsWith('enc:') ? safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64')) : stored
  }
}

async function boot(): Promise<Core> {
  let lastError: unknown
  const ports = devUrl ? [basePort] : [0, 1, 2, 3, 4].map((n) => basePort + n)
  for (const port of ports) {
    try {
      return await startCore({
        dataDir: path.join(app.getPath('userData'), 'data'),
        port,
        staticDir: path.join(here, '../renderer'),
        codec: codec(),
        devOrigins: devUrl ? [new URL(devUrl).origin] : [],
        onEvent: (e) => {
          if (!Notification.isSupported() || !e.title) return
          const n = new Notification({ title: e.title, body: e.body ?? '', silent: e.type !== 'urgent' })
          n.on('click', showWindow)
          n.show()
          refreshTray()
        }
      })
    } catch (e) {
      lastError = e
    }
  }
  throw lastError
}

function createWindow(url: string): void {
  win = new BrowserWindow({
    icon: path.join(resources, 'icon.png'),
    width: 1240,
    height: 840,
    minWidth: 760,
    minHeight: 560,
    title: '暖暖猪',
    backgroundColor: '#FAF8F3',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  const origin = new URL(url).origin
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin === origin) return
    event.preventDefault()
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
  })
  win.once('ready-to-show', () => win?.show())
  win.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    win?.hide()
    if (!toldAboutTray && Notification.isSupported()) {
      toldAboutTray = true
      new Notification({ title: '暖暖还在替你看着消息', body: '窗口收到右下角的托盘里了。想退出的话，在托盘图标上点右键。', silent: true }).show()
    }
  })
  win.on('closed', () => (win = null))
  void win.loadURL(url)
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.setAppUserModelId('com.czspig.nuannuan')
  app.on('second-instance', showWindow)
  void app.whenReady().then(async () => {
    core = await boot()
    appUrl = devUrl ?? `http://127.0.0.1:${core.port}/`
    createTray()
    createWindow(appUrl)
  })
  app.on('before-quit', () => {
    quitting = true
  })
  app.on('will-quit', () => core?.close())
  app.on('window-all-closed', () => {
    if (quitting) app.quit()
  })
}
