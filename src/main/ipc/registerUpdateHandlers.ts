import { ipcMain } from 'electron'
import { restartAndInstall } from '../updates/checkForUpdates'

export function registerUpdateHandlers(): void {
  ipcMain.handle('updates:restart', () => restartAndInstall())
}
