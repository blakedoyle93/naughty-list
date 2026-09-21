import { describe, it, expect, vi } from 'vitest'
import { LcuConnection } from './connection'
import type { LockfileInfo } from './lockfile'

const info: LockfileInfo = { processName: 'x', pid: 1, port: 1, password: 'p', protocol: 'https' }

describe('LcuConnection', () => {
  it('retries until lockfile appears, then connects once', () => {
    let present = false
    const timers: Array<() => void> = []
    const onConnected = vi.fn()
    const conn = new LcuConnection({
      readLockfile: () => (present ? info : null),
      makeClient: () => ({ close: vi.fn(), onClose: vi.fn() }) as never,
      onConnected,
      onDisconnected: vi.fn(),
      retryMs: 5000,
      setTimeoutImpl: ((fn: () => void) => {
        timers.push(fn)
        return 0
      }) as never
    })
    conn.start()
    expect(conn.state()).toBe('disconnected')
    timers.shift()!()
    expect(onConnected).not.toHaveBeenCalled()
    present = true
    timers.shift()!()
    expect(onConnected).toHaveBeenCalledTimes(1)
    timers.shift()!()
    expect(onConnected).toHaveBeenCalledTimes(1)
    expect(conn.state()).toBe('connected')
  })

  it('disconnects when the socket closes and reconnects on next tick', () => {
    const timers: Array<() => void> = []
    let closeCb: (() => void) | null = null
    const onDisconnected = vi.fn()
    const onConnected = vi.fn()
    const conn = new LcuConnection({
      readLockfile: () => info,
      makeClient: () =>
        ({
          close: vi.fn(),
          onClose: (cb: () => void) => {
            closeCb = cb
          }
        }) as never,
      onConnected,
      onDisconnected,
      setTimeoutImpl: ((fn: () => void) => {
        timers.push(fn)
        return 0
      }) as never
    })
    conn.start()
    expect(onConnected).toHaveBeenCalledTimes(1)
    closeCb!()
    expect(onDisconnected).toHaveBeenCalledTimes(1)
    expect(conn.state()).toBe('disconnected')
    timers.shift()!()
    expect(onConnected).toHaveBeenCalledTimes(2)
  })
})
