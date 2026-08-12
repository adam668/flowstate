import { ipcMain } from 'electron'
import { restartAndInstall } from '../updates/checkForUpdates'
import type { UpdateStatus } from '../../shared/types'

/**
 * `updates:status` is push-only, so a status emitted before the renderer
 * mounted its listener would be lost forever. `updates:getStatus` gives the
 * renderer a pull-based way to catch up on the last known status on mount,
 * regardless of which side won the race.
 */
export function registerUpdateHandlers(getLastStatus: () => UpdateStatus | null): void {
  ipcMain.handle('updates:restart', () => restartAndInstall())
  ipcMain.handle('updates:getStatus', () => getLastStatus())
}
