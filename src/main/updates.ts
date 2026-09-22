import type { UpdateStatus } from '@shared/types'

/** The bits of electron-updater we use, so this is testable without Electron. */
export interface UpdaterLike {
  autoDownload: boolean
  on(event: string, cb: (payload: never) => void): unknown
  checkForUpdates(): Promise<unknown>
  downloadUpdate(): Promise<unknown>
  quitAndInstall(): void
}

export interface UpdateDeps {
  updater: UpdaterLike
  version: string
  /** macOS builds are unsigned, so electron-updater cannot install them. */
  canSelfUpdate: boolean
  onStatus: (s: UpdateStatus) => void
  log: (message: string, data?: unknown) => void
}

/**
 * Tracks whether this build is the latest. On Windows it downloads and installs; on macOS an
 * unsigned build can't replace itself, so we only report that a newer version exists.
 */
export class UpdateService {
  private status: UpdateStatus

  constructor(private readonly deps: UpdateDeps) {
    this.status = {
      version: deps.version,
      state: 'idle',
      latest: null,
      canSelfUpdate: deps.canSelfUpdate,
      message: null
    }
    deps.updater.autoDownload = false
    deps.updater.on('update-available', (info: { version: string }) => {
      this.set({ state: deps.canSelfUpdate ? 'downloading' : 'available', latest: info.version })
      if (deps.canSelfUpdate) void deps.updater.downloadUpdate().catch(() => {})
    })
    deps.updater.on('update-not-available', (info: { version: string }) =>
      this.set({ state: 'current', latest: info?.version ?? deps.version })
    )
    deps.updater.on('update-downloaded', (info: { version: string }) =>
      this.set({ state: 'ready', latest: info?.version ?? null })
    )
    deps.updater.on('error', (e: Error) =>
      this.set({ state: 'error', message: e?.message ?? 'update check failed' })
    )
  }

  current(): UpdateStatus {
    return { ...this.status }
  }

  async check(): Promise<UpdateStatus> {
    this.set({ state: 'checking', message: null })
    try {
      await this.deps.updater.checkForUpdates()
    } catch (e) {
      this.set({ state: 'error', message: (e as Error).message })
    }
    return this.current()
  }

  install(): void {
    if (this.status.state !== 'ready') return
    this.deps.updater.quitAndInstall()
  }

  private set(patch: Partial<UpdateStatus>): void {
    this.status = { ...this.status, ...patch }
    this.deps.log(`update ${this.status.state}`, {
      latest: this.status.latest,
      message: this.status.message
    })
    this.deps.onStatus(this.current())
  }
}
