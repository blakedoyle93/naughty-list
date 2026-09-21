import type { LockfileInfo } from './lockfile'

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string }
) => Promise<{ status: number; text(): Promise<string> }>

export interface LcuEvent {
  uri: string
  eventType: 'Create' | 'Update' | 'Delete'
  data: unknown
}

export class LcuHttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}

/** Frames arrive as `[8, eventName, { uri, eventType, data }]`. Anything else is noise. */
export function parseLcuWsMessage(raw: string): LcuEvent | null {
  if (!raw) return null
  try {
    const frame = JSON.parse(raw)
    if (!Array.isArray(frame) || frame[0] !== 8) return null
    const payload = frame[2]
    if (!payload || typeof payload.uri !== 'string') return null
    return { uri: payload.uri, eventType: payload.eventType, data: payload.data }
  } catch {
    return null
  }
}

/** Minimal shape shared by browser WebSocket and the `ws` package. */
export interface WsLike {
  readonly readyState: number
  send(data: string): void
  close(): void
  addEventListener(type: 'open', cb: () => void): void
  addEventListener(type: 'close', cb: () => void): void
  addEventListener(type: 'message', cb: (ev: { data: unknown }) => void): void
}
export type WsFactory = (url: string, headers: Record<string, string>) => WsLike

const WS_OPEN = 1

export class LcuClient {
  private readonly base: string
  private readonly auth: string
  private ws: WsLike | null = null
  private readonly listeners = new Map<string, Set<(e: LcuEvent) => void>>()

  constructor(
    private readonly info: LockfileInfo,
    private readonly deps: { fetch: FetchLike; makeWs: WsFactory }
  ) {
    this.base = `${info.protocol}://127.0.0.1:${info.port}`
    this.auth = 'Basic ' + Buffer.from(`riot:${info.password}`).toString('base64')
  }

  async get(path: string): Promise<unknown> {
    const res = await this.deps.fetch(this.base + path, {
      method: 'GET',
      headers: { Authorization: this.auth, Accept: 'application/json' }
    })
    const text = await res.text()
    if (res.status < 200 || res.status >= 300) throw new LcuHttpError(res.status, text)
    return text ? JSON.parse(text) : null
  }

  subscribe(eventName: string, cb: (e: LcuEvent) => void): () => void {
    if (!this.listeners.has(eventName)) this.listeners.set(eventName, new Set())
    this.listeners.get(eventName)!.add(cb)
    this.ensureSocket(eventName)
    return () => this.listeners.get(eventName)?.delete(cb)
  }

  onClose(cb: () => void): void {
    this.closeHandlers.push(cb)
  }
  private closeHandlers: Array<() => void> = []

  close(): void {
    const ws = this.ws
    this.ws = null
    ws?.close()
  }

  private ensureSocket(eventName: string): void {
    if (this.ws) {
      if (this.ws.readyState === WS_OPEN) this.ws.send(JSON.stringify([5, eventName]))
      return
    }
    const ws = this.deps.makeWs(`wss://127.0.0.1:${this.info.port}/`, { Authorization: this.auth })
    this.ws = ws
    ws.addEventListener('open', () => {
      for (const name of this.listeners.keys()) ws.send(JSON.stringify([5, name]))
    })
    ws.addEventListener('message', (ev) => {
      const e = parseLcuWsMessage(String(ev.data))
      if (!e) return
      for (const [name, cbs] of this.listeners) {
        if (matchesEvent(name, e.uri)) cbs.forEach((fn) => fn(e))
      }
    })
    ws.addEventListener('close', () => {
      const wasCurrent = this.ws === ws
      this.ws = null
      if (wasCurrent) this.closeHandlers.forEach((fn) => fn())
    })
  }
}

/** 'OnJsonApiEvent_lol-gameflow_v1_gameflow-phase' ↔ '/lol-gameflow/v1/gameflow-phase' */
function matchesEvent(eventName: string, uri: string): boolean {
  if (eventName === 'OnJsonApiEvent') return true
  const expected = '/' + eventName.replace(/^OnJsonApiEvent_/, '').replace(/_/g, '/')
  return uri === expected
}
