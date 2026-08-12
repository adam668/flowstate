import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { createConnection } from './db/connection'
import { registerHandlers } from './ipc/registerHandlers'
import { registerUpdateHandlers } from './ipc/registerUpdateHandlers'
import { checkForUpdates } from './updates/checkForUpdates'

let mainWindow: BrowserWindow | null = null

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
  registerUpdateHandlers()
  createWindow()
  checkForUpdates((status) => {
    mainWindow?.webContents.send('updates:status', status)
  })
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
