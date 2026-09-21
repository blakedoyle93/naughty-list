import type { Flag, Hit, Player } from '@shared/types'

export function matchPlayers(players: Player[], flags: Flag[]): Hit[] {
  const byPuuid = new Map<string, Flag[]>()
  for (const f of flags) {
    const list = byPuuid.get(f.puuid) ?? []
    list.push(f)
    byPuuid.set(f.puuid, list)
  }
  const hits: Hit[] = []
  for (const p of players) {
    if (!p.puuid) continue
    const fs = byPuuid.get(p.puuid)
    if (!fs?.length) continue
    hits.push({ player: p, flags: [...fs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) })
  }
  return hits
}

export class AlertDeduper {
  private gameId: string | null = null
  private seen = new Set<string>()

  /** returns only hits not yet alerted for this gameId; forgets other games */
  take(gameId: string, hits: Hit[]): Hit[] {
    if (gameId !== this.gameId) {
      this.gameId = gameId
      this.seen = new Set()
    }
    const fresh = hits.filter((h) => h.player.puuid && !this.seen.has(h.player.puuid))
    fresh.forEach((h) => this.seen.add(h.player.puuid!))
    return fresh
  }
}
