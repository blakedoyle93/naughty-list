import type { GameflowPhase, Player, PlayerRecord, RiotId } from '@shared/types'
import { LcuHttpError } from './client'
import {
  ChampSelectSessionSchema,
  EogStatsBlockSchema,
  GameflowSessionSchema,
  SummonerLikeSchema,
  SummonerSchema
} from './schemas'

export interface LcuApi {
  getGameflowPhase(): Promise<GameflowPhase>
  getGameflowSession(): Promise<{ phase: GameflowPhase; gameId: string } | null>
  /** allies only (self excluded); puuid null when Riot hides the player */
  getChampSelectPlayers(): Promise<Player[]>
  getEogPlayers(): Promise<{ gameId: string; players: Player[] }>
  /** Riot ID → player. Tries several LCU endpoints; the client's answer shape varies by patch. */
  lookupAlias(id: RiotId): Promise<PlayerRecord | null>
  /** Legacy name-only search. Best effort: works when the game name is unique on the region. */
  lookupByName(gameName: string): Promise<PlayerRecord | null>
  /** Raw answers from every lookup endpoint, for the in-app diagnostic. */
  debugLookup(id: RiotId): Promise<string>
  getSummonerById(summonerId: number): Promise<PlayerRecord | null>
}

type Getter = { get(path: string): Promise<unknown> }

/** Every way we know to ask the client about a Riot ID, most reliable first. */
function lookupPaths(id: RiotId): string[] {
  const name = encodeURIComponent(id.gameName)
  const tag = encodeURIComponent(id.tagLine)
  return [
    `/lol-summoner/v1/summoners?name=${name}%23${tag}`,
    `/lol-summoner/v1/alias/lookup?gameName=${name}&tagLine=${tag}`,
    `/lol-summoner/v1/summoners?name=${name}`
  ]
}

const log = (msg: string, err: unknown): void => console.warn(`[lcu] ${msg}`, err)

function toRecord(s: { puuid: string; gameName: string; tagLine: string }): PlayerRecord {
  return {
    puuid: s.puuid,
    gameName: s.gameName,
    tagLine: s.tagLine,
    region: null,
    lastSeenAt: new Date().toISOString()
  }
}

export function createLcuApi(client: Getter): LcuApi {
  async function getSummonerById(summonerId: number): Promise<PlayerRecord | null> {
    try {
      const parsed = SummonerSchema.safeParse(
        await client.get(`/lol-summoner/v1/summoners/${summonerId}`)
      )
      return parsed.success ? toRecord(parsed.data) : null
    } catch (e) {
      if (!(e instanceof LcuHttpError)) log('getSummonerById', e)
      return null
    }
  }

  return {
    async getGameflowPhase() {
      const v = await client.get('/lol-gameflow/v1/gameflow-phase')
      return typeof v === 'string' ? v : 'None'
    },

    async getGameflowSession() {
      try {
        const parsed = GameflowSessionSchema.safeParse(await client.get('/lol-gameflow/v1/session'))
        if (!parsed.success) return null
        return { phase: parsed.data.phase, gameId: String(parsed.data.gameData.gameId) }
      } catch {
        return null
      }
    },

    async getChampSelectPlayers() {
      let raw: unknown
      try {
        raw = await client.get('/lol-champ-select/v1/session')
      } catch (e) {
        log('champ select fetch', e)
        return []
      }
      const parsed = ChampSelectSessionSchema.safeParse(raw)
      if (!parsed.success) {
        log('champ select shape', parsed.error.flatten())
        return []
      }
      const allies = parsed.data.myTeam.filter((c) => c.cellId !== parsed.data.localPlayerCellId)
      return Promise.all(
        allies.map(async (c): Promise<Player> => {
          const base: Player = {
            puuid: null,
            gameName: '',
            tagLine: '',
            team: 'ally',
            summonerId: c.summonerId
          }
          if (c.summonerId === 0) return base
          const rec = await getSummonerById(c.summonerId)
          if (!rec) return { ...base, puuid: c.puuid || null }
          return { ...base, puuid: rec.puuid, gameName: rec.gameName, tagLine: rec.tagLine }
        })
      )
    },

    async getEogPlayers() {
      const parsed = EogStatsBlockSchema.safeParse(
        await client.get('/lol-end-of-game/v1/eog-stats-block')
      )
      if (!parsed.success) {
        log('eog shape', parsed.error.flatten())
        return { gameId: '', players: [] }
      }
      const players: Player[] = parsed.data.teams.flatMap((t) =>
        t.players.map((p) => ({
          puuid: p.puuid,
          gameName: p.riotIdGameName ?? p.gameName ?? p.summonerName,
          tagLine: p.riotIdTagLine ?? p.tagLine ?? '',
          team: t.isPlayerTeam ? ('ally' as const) : ('enemy' as const)
        }))
      )
      return { gameId: String(parsed.data.gameId), players }
    },

    async lookupAlias(id) {
      for (const path of lookupPaths(id)) {
        try {
          const parsed = SummonerLikeSchema.safeParse(await client.get(path))
          if (parsed.success && parsed.data?.puuid) return toRecord(parsed.data)
        } catch (e) {
          if (!(e instanceof LcuHttpError)) log('lookupAlias', e)
        }
      }
      return null
    },

    async lookupByName(gameName) {
      try {
        const parsed = SummonerLikeSchema.safeParse(
          await client.get(`/lol-summoner/v1/summoners?name=${encodeURIComponent(gameName)}`)
        )
        return parsed.success && parsed.data?.puuid ? toRecord(parsed.data) : null
      } catch (e) {
        if (!(e instanceof LcuHttpError)) log('lookupByName', e)
        return null
      }
    },

    async debugLookup(id) {
      const lines: string[] = []
      for (const path of lookupPaths(id)) {
        try {
          lines.push(`GET ${path}\n${JSON.stringify(await client.get(path), null, 2)}`)
        } catch (e) {
          const cause = (e as { cause?: unknown }).cause
          const detail = e instanceof LcuHttpError ? `HTTP ${e.status}` : String(e)
          lines.push(`GET ${path}\n${detail}${cause ? `\n  cause: ${String(cause)}` : ''}`)
        }
      }
      return lines.join('\n\n')
    },

    getSummonerById
  }
}
