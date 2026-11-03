import { app, BrowserWindow, shell } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { openDatabase } from '../database/index.ts'
import { getSettings } from '../services/settings.ts'
import { setAppVersion } from '../utils/http.ts'
import { applyTitleBarTheme, registerIpc } from './ipc.ts'
import { initUpdater } from './updater.ts'

if (!app.requestSingleInstanceLock()) app.quit()

function createWindow(): BrowserWindow {
  const light = getSettings().theme === 'light'
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 620,
    show: false,
    backgroundColor: light ? '#f6f6f4' : '#0b0c0e',
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 16, y: 14 } }
      : { titleBarOverlay: { color: '#00000000', symbolColor: light ? '#3f3f46' : '#a1a1aa', height: 40 } }),
    icon: app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(import.meta.dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  })

  win.once('ready-to-show', () => win.show())

  // The renderer never opens windows or navigates away; real links go to the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) e.preventDefault()
  })

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  return win
}

app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.whenReady().then(() => {
  setAppVersion(app.getVersion())
  const userData = app.getPath('userData')
  mkdirSync(userData, { recursive: true })
  openDatabase(join(userData, 'ace.db'))
  registerIpc()
  createWindow()
  applyTitleBarTheme()
  initUpdater()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
