const path = require('path')

console.log('Starting main process...')
console.log('Available globals:', Object.keys(global).filter(k => k !== 'global').sort())

const app = (global as any).app
const BrowserWindow = (global as any).BrowserWindow

if (!app || !BrowserWindow) {
  console.error('Electron API not found in globals, app=', typeof app, 'BrowserWindow=', typeof BrowserWindow)
  console.error('process.argv:', process.argv)
  console.error('Exiting...')
  process.exit(1)
}

console.log('Successfully got Electron API from globals')

let mainWindow: any = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.on('ready', createWindow)

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
