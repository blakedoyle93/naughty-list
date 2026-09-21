import type { LcuState } from '@shared/types'
import type { LcuClient } from './client'
import type { LockfileInfo } from './lockfile'

/** Polls for the lockfile, owns the current LcuClient, reconnects when the client restarts. */
export class LcuConnection {
  private client: LcuClient | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private stopped = false
  private lastInfo: LockfileInfo | null = null

  constructor(
    private readonly deps: {
      readLockfile: () => LockfileInfo | null
      makeClient: (i: LockfileInfo) => LcuClient
      onConnected: (client: LcuClient) => void
      onDisconnected: () => void
      retryMs?: number
      setTimeoutImpl?: typeof setTimeout
    }
  ) {}

  state(): LcuState {
    return this.client ? 'connected' : 'disconnected'
  }

  start(): void {
    this.stopped = false
    this.tick()
  }

  stop(): void {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.drop()
  }

  private tick(): void {
    if (this.stopped) return
    const info = this.deps.readLockfile()
    if (info && (!this.client || info.port !== this.lastInfo?.port)) {
      this.drop()
      this.lastInfo = info
      const client = this.deps.makeClient(info)
      this.client = client
      client.onClose(() => {
        if (this.client === client) this.drop()
      })
      this.deps.onConnected(client)
    } else if (!info && this.client) {
      this.drop()
    }
    this.schedule()
  }

  private schedule(): void {
    const st = this.deps.setTimeoutImpl ?? setTimeout
    this.timer = st(() => this.tick(), this.deps.retryMs ?? 5000)
  }

  private drop(): void {
    if (!this.client) return
    this.client.close()
    this.client = null
    this.deps.onDisconnected()
  }
}
