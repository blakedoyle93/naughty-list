import type { Hit } from '@shared/types'

/** The bits of Electron's Notification we use, so tests don't need Electron. */
export interface NotificationLike {
  on(event: 'click' | 'show' | 'failed' | 'close', cb: (...a: unknown[]) => void): unknown
  show(): void
}

export interface AlerterDeps {
  /** null when the platform has no notification centre. */
  makeNotification: (opts: {
    title: string
    body: string
    silent: boolean
  }) => NotificationLike | null
  /** Bring the app forward: dock bounce on mac, flashFrame on Windows. */
  grabAttention: () => void
  /** Show + focus the window when the toast is clicked. */
  focusWindow: () => void
  log: (message: string, data?: unknown) => void
}

export function alertTitle(hit: Hit): string {
  const { gameName, tagLine, team } = hit.player
  return `⚠ ${gameName}#${tagLine} is on the naughty list (${team})`
}

export class Alerter {
  constructor(private readonly deps: AlerterDeps) {}

  /**
   * Toasts are best-effort: unsigned macOS builds and "Do Not Disturb" both
   * swallow them silently, so we always bounce the dock / flash the taskbar
   * as well. Every outcome is logged, because "I got no notification" is
   * otherwise impossible to debug from a friend's machine.
   */
  alert(hit: Hit): void {
    const title = alertTitle(hit)
    const body = hit.flags[0]?.note ?? ''

    this.deps.grabAttention()

    let n: NotificationLike | null = null
    try {
      n = this.deps.makeNotification({ title, body, silent: false })
    } catch (e) {
      this.deps.log('could not build a notification', String(e))
      return
    }
    if (!n) {
      this.deps.log('notifications are not supported on this machine, used the dock only')
      return
    }

    n.on('show', () => this.deps.log('notification shown', title))
    n.on('failed', (...a: unknown[]) => this.deps.log('notification failed', a.map(String)))
    n.on('click', () => this.deps.focusWindow())

    try {
      n.show()
      this.deps.log('notification sent', title)
    } catch (e) {
      this.deps.log('notification threw on show', String(e))
    }
  }
}
