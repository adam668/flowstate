import { describe, it, expect, vi, beforeEach } from 'vitest'

const listeners: Record<string, (...args: any[]) => void> = {}

vi.mock('electron-updater', () => ({
  autoUpdater: {
    autoDownload: false,
    autoInstallOnAppQuit: true,
    on: vi.fn((event: string, cb: (...args: any[]) => void) => {
      listeners[event] = cb
    }),
    checkForUpdates: vi.fn(() => Promise.resolve()),
    quitAndInstall: vi.fn()
  }
}))

let isPackaged = true
vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return isPackaged
    }
  }
}))

import { checkForUpdates, restartAndInstall } from './checkForUpdates'
import { autoUpdater } from 'electron-updater'

const mockAutoUpdater = autoUpdater as any

describe('checkForUpdates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(listeners).forEach((k) => delete listeners[k])
    isPackaged = true
  })

  it('no-ops when the app is not packaged (dev mode)', () => {
    isPackaged = false
    const onStatus = vi.fn()
    checkForUpdates(onStatus)
    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled()
    expect(onStatus).not.toHaveBeenCalled()
  })

  it('checks for updates and reports ready when update-downloaded fires', () => {
    const onStatus = vi.fn()
    checkForUpdates(onStatus)
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalled()
    listeners['update-downloaded']({ version: '1.2.3' })
    expect(onStatus).toHaveBeenCalledWith({ state: 'ready', version: '1.2.3' })
  })

  it('reports download progress as a rounded percent', () => {
    const onStatus = vi.fn()
    checkForUpdates(onStatus)
    listeners['download-progress']({ percent: 42.7 })
    expect(onStatus).toHaveBeenCalledWith({ state: 'downloading', percent: 43 })
  })

  it('reports error status when the update check rejects, without throwing', async () => {
    mockAutoUpdater.checkForUpdates.mockReturnValueOnce(Promise.reject(new Error('network down')))
    const onStatus = vi.fn()
    expect(() => checkForUpdates(onStatus)).not.toThrow()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onStatus).toHaveBeenCalledWith({ state: 'error', message: 'network down' })
  })

  it('restartAndInstall calls autoUpdater.quitAndInstall', () => {
    restartAndInstall()
    expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalled()
  })
})
