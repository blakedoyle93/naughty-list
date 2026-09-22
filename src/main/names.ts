import type { PastGame, PlayerRecord, RiotId } from '@shared/types'

export interface ResolveDeps {
  /** Your own recent games; their players are the cheapest, most reliable source of tags. */
  history: () => Promise<PastGame[]>
  /** op.gg search, for people you never played with. */
  searchOpgg: (name: string, region: string) => Promise<RiotId[]>
  lookupAlias: (id: RiotId) => Promise<PlayerRecord | null>
  region: string
}

export interface Resolution {
  /** Where the tag came from, for the UI to explain itself. */
  source: 'given' | 'history' | 'opgg'
  record: PlayerRecord
}

/**
 * Turns a name (with or without a tag) into a real player. Order matters: a tag the user typed
 * wins, then anyone you've played with, then op.gg. Every path ends at the League client, so a
 * PUUID is always Riot's, never op.gg's guess.
 */
export function createResolver(deps: ResolveDeps): {
  resolve: (name: string, tagLine: string) => Promise<Resolution | null>
  candidates: (name: string) => Promise<RiotId[]>
} {
  let cache: Promise<Map<string, RiotId[]>> | null = null

  const historyIndex = async (): Promise<Map<string, RiotId[]>> => {
    cache ??= deps.history().then((games) => {
      const byName = new Map<string, RiotId[]>()
      for (const g of games) {
        for (const p of g.players) {
          if (!p.gameName || !p.tagLine) continue
          const key = p.gameName.toLowerCase()
          const seen = byName.get(key) ?? []
          if (!seen.some((s) => s.tagLine === p.tagLine)) {
            byName.set(key, [...seen, { gameName: p.gameName, tagLine: p.tagLine }])
          }
        }
      }
      return byName
    })
    return cache
  }

  async function candidates(name: string): Promise<RiotId[]> {
    const fromHistory = (await historyIndex()).get(name.trim().toLowerCase()) ?? []
    if (fromHistory.length) return fromHistory
    return deps.searchOpgg(name.trim(), deps.region)
  }

  return {
    candidates,
    async resolve(name, tagLine) {
      const clean = name.trim()
      if (!clean) return null
      const given = tagLine.trim().replace(/^#/, '')
      if (given) {
        const rec = await deps.lookupAlias({ gameName: clean, tagLine: given })
        if (rec) return { source: 'given', record: rec }
      }
      const fromHistory = (await historyIndex()).get(clean.toLowerCase()) ?? []
      for (const id of fromHistory) {
        const rec = await deps.lookupAlias(id)
        if (rec) return { source: 'history', record: rec }
      }
      for (const id of await deps.searchOpgg(clean, deps.region)) {
        const rec = await deps.lookupAlias(id)
        if (rec) return { source: 'opgg', record: rec }
      }
      return null
    }
  }
}
