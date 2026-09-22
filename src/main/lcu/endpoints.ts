import type { GameflowPhase, PastGame, Player, PlayerRecord, RiotId } from '@shared/types'
import { LcuHttpError } from './client'
import {
  ChampSelectSessionSchema,
  EogStatsBlockSchema,
  GameflowSessionSchema,
  MatchHistorySchema,
  MatchSchema,
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
  /** Your own recent games, newest first, each with all ten players and their Riot IDs. */
  getMatchHistory(count?: number): Promise<PastGame[]>
  /** One game in full. The history list only names you; this names everyone. */
  getGame(gameId: string, myPuuid: string): Promise<PastGame | null>
}

/** Queue ids we care to name; anything else shows as "Game". */
const QUEUES: Record<number, string> = {
  400: 'Draft',
  420: 'Ranked Solo',
  430: 'Blind',
  440: 'Ranked Flex',
  450: 'ARAM',
  700: 'Clash',
  830: 'Co-op vs AI',
  840: 'Co-op vs AI',
  850: 'Co-op vs AI',
  1700: 'Arena',
  1900: 'URF'
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
  async function getGame(gameId: string, myPuuid: string): Promise<PastGame | null> {
    try {
      const parsed = MatchSchema.safeParse(
        await client.get(`/lol-match-history/v1/games/${gameId}`)
      )
      return parsed.success ? toPastGame(parsed.data, myPuuid) : null
    } catch (e) {
      if (!(e instanceof LcuHttpError)) log('getGame', e)
      return null
    }
  }

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

    async getMatchHistory(count = 20) {
      try {
        const raw = await client.get(
          `/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=${count}`
        )
        const parsed = MatchHistorySchema.safeParse(raw)
        if (!parsed.success) {
          log('match history shape', parsed.error.flatten())
          return []
        }
        const me = SummonerSchema.safeParse(await client.get('/lol-summoner/v1/current-summoner'))
        const myPuuid = me.success ? me.data.puuid : ''
        const summaries = parsed.data.games.games.map((g) => toPastGame(g, myPuuid))
        // The list endpoint only fills in your own participant, so ask for each game in full.
        // One at a time: this is a local client, not a server, and 20 parallel calls upset it.
        const full: PastGame[] = []
        for (const summary of summaries) {
          full.push(
            namesMissing(summary) ? ((await getGame(summary.gameId, myPuuid)) ?? summary) : summary
          )
        }
        return full
      } catch (e) {
        if (!(e instanceof LcuHttpError)) log('getMatchHistory', e)
        return []
      }
    },

    getGame,
    getSummonerById
  }
}

/** True when the client trimmed everyone but you out of the game summary. */
function namesMissing(game: PastGame): boolean {
  return game.players.filter((p) => p.gameName).length < 2
}

/** Match history only gives team ids (100/200), so "ally" is whichever side you were on. */
function toPastGame(
  m: {
    gameId: number
    gameCreation: number
    gameCreationDate: string
    queueId: number
    participantIdentities: Array<{
      participantId: number
      player: { puuid: string; gameName: string; tagLine: string; summonerName: string }
    }>
    participants: Array<{
      participantId: number
      teamId: number
      championId: number
      stats?: { win: boolean }
    }>
  },
  myPuuid: string
): PastGame {
  const byId = new Map(m.participants.map((p) => [p.participantId, p]))
  const mine = m.participantIdentities.find((i) => i.player.puuid === myPuuid)
  const myTeam = mine ? (byId.get(mine.participantId)?.teamId ?? 100) : 100
  const players: Player[] = m.participantIdentities.map((id) => {
    const part = byId.get(id.participantId)
    return {
      puuid: id.player.puuid || null,
      gameName: id.player.gameName || id.player.summonerName,
      tagLine: id.player.tagLine,
      team: part?.teamId === myTeam ? ('ally' as const) : ('enemy' as const)
    }
  })
  return {
    gameId: String(m.gameId),
    playedAt: m.gameCreationDate || (m.gameCreation ? new Date(m.gameCreation).toISOString() : ''),
    queue: QUEUES[m.queueId] ?? 'Game',
    win: mine ? (byId.get(mine.participantId)?.stats?.win ?? null) : null,
    players
  }
}
