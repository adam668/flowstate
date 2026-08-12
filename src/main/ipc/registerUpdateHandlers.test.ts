import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { UpdateStatus } from '../../shared/types'

// Capture every handler registered via ipcMain.handle so we can invoke them directly.
const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, ...args: unknown[]) => unknown): void => {
      handlers.set(channel, fn)
    }
  }
}))

const quitAndInstall = vi.fn()
vi.mock('../updates/checkForUpdates', () => ({
  restartAndInstall: (): void => quitAndInstall()
}))

// Imported after the mocks so registerUpdateHandlers picks up the mocked ipcMain.
const { registerUpdateHandlers } = await import('./registerUpdateHandlers')

function invoke<T>(channel: string, ...args: unknown[]): T {
  const handler = handlers.get(channel)
  if (!handler) throw new Error(`No handler registered for ${channel}`)
  return handler(null, ...args) as T
}

describe('registerUpdateHandlers', () => {
  beforeEach(() => {
    handlers.clear()
    quitAndInstall.mockClear()
  })

  it('registers both the restart and getStatus channels', () => {
    registerUpdateHandlers(() => null)

    expect([...handlers.keys()].sort()).toEqual(['updates:getStatus', 'updates:restart'])
  })

  it('returns null from getStatus when no status has been seen yet', () => {
    registerUpdateHandlers(() => null)

    expect(invoke('updates:getStatus')).toBeNull()
  })

  it('returns the latest cached status, so a renderer that mounts late can catch up', () => {
    // Mirrors main/index.ts: a mutable variable updated by the checkForUpdates
    // callback, read lazily through the getter.
    let lastStatus: UpdateStatus | null = null
    registerUpdateHandlers(() => lastStatus)

    lastStatus = { state: 'checking' }
    expect(invoke('updates:getStatus')).toEqual({ state: 'checking' })

    // A 'ready' status pushed before the renderer subscribed is still readable.
    lastStatus = { state: 'ready', version: '1.2.3' }
    expect(invoke('updates:getStatus')).toEqual({ state: 'ready', version: '1.2.3' })
  })

  it('delegates updates:restart to restartAndInstall', () => {
    registerUpdateHandlers(() => null)

    invoke('updates:restart')

    expect(quitAndInstall).toHaveBeenCalledTimes(1)
  })
})
