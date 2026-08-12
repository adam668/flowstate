import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { createConnection } from './db/connection'
import { registerHandlers } from './ipc/registerHandlers'
import { registerUpdateHandlers } from './ipc/registerUpdateHandlers'
import { checkForUpdates } from './updates/checkForUpdates'
import type { UpdateStatus } from '../shared/types'

let mainWindow: BrowserWindow | null = null
// Cached so the renderer can pull the last status on mount via
// `updates:getStatus` — a status pushed before it subscribed isn't lost.
let lastUpdateStatus: UpdateStatus | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.on('ready', () => {
  const db = createConnection(join(app.getPath('userData'), 'flowstate.db'))
  registerHandlers(db)
  registerUpdateHandlers(() => lastUpdateStatus)
  createWindow()
  if (process.env['FLOWSTATE_FAKE_UPDATE']) {
    // Dev-only escape hatch: lets the update banner and restart flow be
    // smoke-tested without cutting a real release. Never calls
    // checkForUpdates, so it works in unpackaged dev mode too.
    const fakeStatus: UpdateStatus = { state: 'ready', version: '9.9.9' }
    lastUpdateStatus = fakeStatus
    setTimeout(() => mainWindow?.webContents.send('updates:status', fakeStatus), 1000)
  } else {
    checkForUpdates((status) => {
      lastUpdateStatus = status
      if (status.state === 'error') {
        console.error('[updates]', status.message)
      }
      mainWindow?.webContents.send('updates:status', status)
    })
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})
