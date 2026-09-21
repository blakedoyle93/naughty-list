import type { Player } from '@shared/types'
import type { FetchLike } from '@main/lcu/client'
import { LivePlayerListSchema } from './schemas'

export const LIVE_BASE = 'https://127.0.0.1:2999/liveclientdata'

export function parsePlayerList(raw: unknown, activePlayerRiotId: string): Player[] {
  const parsed = LivePlayerListSchema.safeParse(raw)
  if (!parsed.success) return []
  const me = parsed.data.find(
    (p) => (p.riotId ?? `${p.riotIdGameName}#${p.riotIdTagLine}`) === activePlayerRiotId
  )
  const allyTeam = me?.team ?? 'ORDER'
  return parsed.data.map((p) => ({
    puuid: null,
    gameName: p.riotIdGameName || p.summonerName,
    tagLine: p.riotIdTagLine,
    team: p.team === allyTeam ? 'ally' : 'enemy',
    championName: p.championName
  }))
}

/** Polls until the game process answers or timeoutMs elapses. */
export async function pollPlayerList(
  deps: { fetch: FetchLike; sleep: (ms: number) => Promise<void>; now: () => number },
  opts: { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<Player[] | null> {
  const intervalMs = opts.intervalMs ?? 1000
  const timeoutMs = opts.timeoutMs ?? 60_000
  const start = deps.now()
  const headers = { Accept: 'application/json' }
  while (deps.now() - start < timeoutMs) {
    if (opts.signal?.aborted) return null
    try {
      const me = await deps.fetch(`${LIVE_BASE}/activeplayername`, { method: 'GET', headers })
      const all = await deps.fetch(`${LIVE_BASE}/playerlist`, { method: 'GET', headers })
      if (me.status === 200 && all.status === 200) {
        const riotId = JSON.parse(await me.text()) as string
        const players = parsePlayerList(JSON.parse(await all.text()), riotId)
        if (players.length > 0) return players
      }
    } catch {
      /* game process not up yet */
    }
    await deps.sleep(intervalMs)
  }
  return null
}
