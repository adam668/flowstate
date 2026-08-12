import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '../../shared/types'

/**
 * Wraps electron-updater's autoUpdater, forwarding every state change through
 * a plain callback instead of electron-updater's own dialogs, so the renderer
 * controls how (and whether) it's surfaced. No-ops entirely when the app is
 * running unpackaged (dev mode) — electron-updater requires a real packaged
 * app with an app-update.yml, which only exists in a built installer.
 */
export function checkForUpdates(onStatus: (status: UpdateStatus) => void): void {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('checking-for-update', () => onStatus({ state: 'checking' }))
  autoUpdater.on('update-available', (info) =>
    onStatus({ state: 'available', version: info.version })
  )
  autoUpdater.on('update-not-available', () => onStatus({ state: 'not-available' }))
  autoUpdater.on('download-progress', (progress) =>
    onStatus({ state: 'downloading', percent: Math.round(progress.percent) })
  )
  autoUpdater.on('update-downloaded', (info) => onStatus({ state: 'ready', version: info.version }))
  autoUpdater.on('error', (err) => onStatus({ state: 'error', message: err.message }))

  // A failed check must never crash the app or block startup — it's reported
  // through the same status channel as everything else and otherwise ignored.
  autoUpdater.checkForUpdates().catch((err: Error) => {
    onStatus({ state: 'error', message: err.message })
  })
}

export function restartAndInstall(): void {
  autoUpdater.quitAndInstall()
}
