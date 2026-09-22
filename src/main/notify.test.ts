import { describe, it, expect, vi } from 'vitest'
import { Alerter, alertTitle, type NotificationLike } from './notify'
import type { Hit } from '@shared/types'

const hit: Hit = {
  player: { puuid: 'p1', gameName: 'fockoff', tagLine: 'OCE', team: 'enemy' },
  flags: [
    {
      id: 'f1',
      crewId: 'c1',
      puuid: 'p1',
      note: 'dodges every game',
      createdBy: 'u1',
      createdByName: 'Blake',
      createdAt: '2026-01-01T00:00:00.000Z'
    }
  ]
}

function fakeNotification(): NotificationLike & { fire(e: string): void } {
  const handlers = new Map<string, Array<(...a: unknown[]) => void>>()
  return {
    on(event: string, cb: (...a: unknown[]) => void) {
      handlers.set(event, [...(handlers.get(event) ?? []), cb])
      return this
    },
    show: vi.fn(),
    fire(event: string) {
      handlers.get(event)?.forEach((cb) => cb())
    }
  }
}

describe('Alerter', () => {
  it('names the player, the tag and the team in the title', () => {
    expect(alertTitle(hit)).toBe('⚠ fockoff#OCE is on the naughty list (enemy)')
  })

  it('shows a toast with the note and logs that it went out', () => {
    const n = fakeNotification()
    const log = vi.fn()
    new Alerter({
      makeNotification: vi.fn(() => n),
      grabAttention: vi.fn(),
      focusWindow: vi.fn(),
      log
    }).alert(hit)
    expect(n.show).toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith('notification sent', alertTitle(hit))
  })

  it('bounces the dock even when the machine cannot show notifications', () => {
    const grabAttention = vi.fn()
    const log = vi.fn()
    new Alerter({
      makeNotification: () => null,
      grabAttention,
      focusWindow: vi.fn(),
      log
    }).alert(hit)
    expect(grabAttention).toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith(
      'notifications are not supported on this machine, used the dock only'
    )
  })

  it('still bounces the dock when building the toast throws', () => {
    const grabAttention = vi.fn()
    const log = vi.fn()
    new Alerter({
      makeNotification: () => {
        throw new Error('no notification centre')
      },
      grabAttention,
      focusWindow: vi.fn(),
      log
    }).alert(hit)
    expect(grabAttention).toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith(
      'could not build a notification',
      'Error: no notification centre'
    )
  })

  it('logs a delivery failure reported by the OS', () => {
    const n = fakeNotification()
    const log = vi.fn()
    new Alerter({
      makeNotification: () => n,
      grabAttention: vi.fn(),
      focusWindow: vi.fn(),
      log
    }).alert(hit)
    n.fire('failed')
    expect(log).toHaveBeenCalledWith('notification failed', [])
  })

  it('focuses the window when the toast is clicked', () => {
    const n = fakeNotification()
    const focusWindow = vi.fn()
    new Alerter({
      makeNotification: () => n,
      grabAttention: vi.fn(),
      focusWindow,
      log: vi.fn()
    }).alert(hit)
    n.fire('click')
    expect(focusWindow).toHaveBeenCalled()
  })
})
