import { describe, it, expect, vi } from 'vitest'
import { UpdateService, type UpdaterLike } from './updates'

function fakeUpdater(): UpdaterLike & { fire(event: string, payload?: unknown): void } {
  const handlers = new Map<string, Array<(p: unknown) => void>>()
  return {
    autoDownload: true,
    on(event: string, cb: (p: never) => void) {
      handlers.set(event, [...(handlers.get(event) ?? []), cb as (p: unknown) => void])
      return this
    },
    checkForUpdates: vi.fn(async () => ({})),
    downloadUpdate: vi.fn(async () => ({})),
    quitAndInstall: vi.fn(),
    fire(event: string, payload?: unknown) {
      handlers.get(event)?.forEach((cb) => cb(payload))
    }
  }
}

function make(canSelfUpdate: boolean): {
  updater: ReturnType<typeof fakeUpdater>
  svc: UpdateService
  onStatus: ReturnType<typeof vi.fn>
} {
  const updater = fakeUpdater()
  const onStatus = vi.fn()
  const svc = new UpdateService({
    updater,
    version: '0.2.1',
    canSelfUpdate,
    onStatus,
    log: vi.fn()
  })
  return { updater, svc, onStatus }
}

describe('UpdateService', () => {
  it('starts idle on the running version and turns off silent downloads', () => {
    const { svc, updater } = make(true)
    expect(svc.current()).toMatchObject({ version: '0.2.1', state: 'idle', latest: null })
    expect(updater.autoDownload).toBe(false)
  })

  it('downloads then offers a restart on Windows', async () => {
    const { svc, updater, onStatus } = make(true)
    await svc.check()
    updater.fire('update-available', { version: '0.3.0' })
    expect(updater.downloadUpdate).toHaveBeenCalled()
    expect(svc.current()).toMatchObject({ state: 'downloading', latest: '0.3.0' })
    updater.fire('update-downloaded', { version: '0.3.0' })
    expect(svc.current().state).toBe('ready')
    svc.install()
    expect(updater.quitAndInstall).toHaveBeenCalled()
    expect(onStatus).toHaveBeenCalled()
  })

  it('only reports the new version when it cannot install itself', () => {
    const { svc, updater } = make(false)
    updater.fire('update-available', { version: '0.3.0' })
    expect(updater.downloadUpdate).not.toHaveBeenCalled()
    expect(svc.current()).toMatchObject({ state: 'available', canSelfUpdate: false })
  })

  it('reports being current, and errors instead of throwing', async () => {
    const { svc, updater } = make(true)
    updater.fire('update-not-available', { version: '0.2.1' })
    expect(svc.current().state).toBe('current')
    updater.checkForUpdates = vi.fn(async () => {
      throw new Error('no releases')
    })
    await svc.check()
    expect(svc.current()).toMatchObject({ state: 'error', message: 'no releases' })
  })

  it('ignores install until an update is actually downloaded', () => {
    const { svc, updater } = make(true)
    svc.install()
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
  })
})
