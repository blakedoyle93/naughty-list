import { describe, it, expect, vi } from 'vitest'
import { LcuClient, LcuHttpError, parseLcuWsMessage, type WsLike } from './client'
import type { LockfileInfo } from './lockfile'

const info: LockfileInfo = {
  processName: 'x',
  pid: 1,
  port: 5555,
  password: 'pw',
  protocol: 'https'
}
const noWs = (): WsLike => {
  throw new Error('ws not expected')
}

describe('LcuClient.get', () => {
  it('calls the right url with basic auth and parses json', async () => {
    const fetch = vi.fn().mockResolvedValue({ status: 200, text: async () => '{"phase":"Lobby"}' })
    const c = new LcuClient(info, { fetch, makeWs: noWs })
    await expect(c.get('/lol-gameflow/v1/gameflow-phase')).resolves.toEqual({ phase: 'Lobby' })
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://127.0.0.1:5555/lol-gameflow/v1/gameflow-phase')
    expect(init.headers.Authorization).toBe('Basic ' + Buffer.from('riot:pw').toString('base64'))
  })
  it('throws LcuHttpError on non-2xx', async () => {
    const fetch = vi.fn().mockResolvedValue({ status: 404, text: async () => '{"message":"nope"}' })
    const c = new LcuClient(info, { fetch, makeWs: noWs })
    await expect(c.get('/x')).rejects.toBeInstanceOf(LcuHttpError)
  })
})

describe('LcuClient.subscribe', () => {
  function fakeWs(): WsLike & { fire(type: string, ev?: unknown): void; sent: string[] } {
    const handlers = new Map<string, Array<(ev: unknown) => void>>()
    const ws = {
      readyState: 0,
      sent: [] as string[],
      send(d: string) {
        ws.sent.push(d)
      },
      close() {
        /* noop */
      },
      addEventListener(type: string, cb: (ev: unknown) => void) {
        handlers.set(type, [...(handlers.get(type) ?? []), cb])
      },
      fire(type: string, ev?: unknown) {
        if (type === 'open') ws.readyState = 1
        handlers.get(type)?.forEach((fn) => fn(ev))
      }
    }
    return ws
  }

  it('subscribes on open and routes matching events', () => {
    const ws = fakeWs()
    const c = new LcuClient(info, { fetch: vi.fn(), makeWs: () => ws })
    const cb = vi.fn()
    c.subscribe('OnJsonApiEvent_lol-gameflow_v1_gameflow-phase', cb)
    ws.fire('open')
    expect(ws.sent).toEqual([JSON.stringify([5, 'OnJsonApiEvent_lol-gameflow_v1_gameflow-phase'])])
    ws.fire('message', {
      data: JSON.stringify([
        8,
        'OnJsonApiEvent_lol-gameflow_v1_gameflow-phase',
        { uri: '/lol-gameflow/v1/gameflow-phase', eventType: 'Update', data: 'ChampSelect' }
      ])
    })
    ws.fire('message', {
      data: JSON.stringify([8, 'x', { uri: '/other', eventType: 'Update', data: 1 }])
    })
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb.mock.calls[0][0].data).toBe('ChampSelect')
  })

  it('fires onClose when the socket drops', () => {
    const ws = fakeWs()
    const c = new LcuClient(info, { fetch: vi.fn(), makeWs: () => ws })
    const closed = vi.fn()
    c.onClose(closed)
    c.subscribe('OnJsonApiEvent', vi.fn())
    ws.fire('close')
    expect(closed).toHaveBeenCalledTimes(1)
  })
})

describe('parseLcuWsMessage', () => {
  it('parses opcode 8 event frames', () => {
    const raw = JSON.stringify([
      8,
      'OnJsonApiEvent_lol-gameflow_v1_gameflow-phase',
      { uri: '/lol-gameflow/v1/gameflow-phase', eventType: 'Update', data: 'ChampSelect' }
    ])
    expect(parseLcuWsMessage(raw)).toEqual({
      uri: '/lol-gameflow/v1/gameflow-phase',
      eventType: 'Update',
      data: 'ChampSelect'
    })
  })
  it('ignores empty keepalive frames and other opcodes', () => {
    expect(parseLcuWsMessage('')).toBeNull()
    expect(parseLcuWsMessage('[6,"x"]')).toBeNull()
    expect(parseLcuWsMessage('not json')).toBeNull()
  })
})
