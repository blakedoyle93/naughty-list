import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { createLcuApi } from './endpoints'
import { LcuHttpError } from './client'

const fx = (n: string): unknown => JSON.parse(readFileSync(`test/fixtures/${n}.json`, 'utf8'))

function clientWith(routes: Record<string, unknown>): { get: (path: string) => Promise<unknown> } {
  return {
    get: vi.fn(async (path: string) => {
      const key = Object.keys(routes).find((r) => path.startsWith(r))
      if (!key) throw new LcuHttpError(404, path)
      return routes[key]
    })
  }
}

describe('createLcuApi', () => {
  it('getGameflowPhase returns the bare string', async () => {
    const api = createLcuApi(clientWith({ '/lol-gameflow/v1/gameflow-phase': 'ChampSelect' }))
    await expect(api.getGameflowPhase()).resolves.toBe('ChampSelect')
  })

  it('getGameflowSession extracts gameId as string', async () => {
    const api = createLcuApi(clientWith({ '/lol-gameflow/v1/session': fx('gameflow-session') }))
    await expect(api.getGameflowSession()).resolves.toEqual({
      phase: 'InProgress',
      gameId: '7001234567'
    })
  })

  it('getChampSelectPlayers returns allies, keeps hidden ones with null puuid, excludes self', async () => {
    const api = createLcuApi(
      clientWith({
        '/lol-champ-select/v1/session': fx('champ-select-session'),
        '/lol-summoner/v1/summoners/111': {
          puuid: 'puuid-ally-0',
          gameName: 'Ally',
          tagLine: 'NA1'
        }
      })
    )
    const players = await api.getChampSelectPlayers()
    expect(players).toEqual([
      { puuid: 'puuid-ally-0', gameName: 'Ally', tagLine: 'NA1', team: 'ally', summonerId: 111 },
      { puuid: null, gameName: '', tagLine: '', team: 'ally', summonerId: 0 }
    ])
  })

  it('getEogPlayers flattens both teams with riot ids', async () => {
    const api = createLcuApi(
      clientWith({ '/lol-end-of-game/v1/eog-stats-block': fx('eog-stats-block') })
    )
    const { gameId, players } = await api.getEogPlayers()
    expect(gameId).toBe('7001234567')
    expect(players).toEqual([
      { puuid: 'puuid-me', gameName: 'Blake', tagLine: 'NA1', team: 'ally' },
      { puuid: 'puuid-enemy-1', gameName: 'xXDariusMainXx', tagLine: '0001', team: 'enemy' }
    ])
  })

  it('lookupAlias returns a PlayerRecord or null on 404', async () => {
    const ok = createLcuApi(
      clientWith({
        '/lol-summoner/v1/summoners?name=Foo%23BAR': {
          puuid: 'p1',
          gameName: 'Foo',
          tagLine: 'BAR'
        }
      })
    )
    const rec = await ok.lookupAlias({ gameName: 'Foo', tagLine: 'BAR' })
    expect(rec).toMatchObject({ puuid: 'p1', gameName: 'Foo', tagLine: 'BAR', region: null })
    const missing = createLcuApi(clientWith({}))
    await expect(missing.lookupAlias({ gameName: 'x', tagLine: 'y' })).resolves.toBeNull()
  })

  it('lookupAlias falls back to alias/lookup and understands its snake_case shape', async () => {
    const api = createLcuApi(
      clientWith({
        '/lol-summoner/v1/alias/lookup': {
          puuid: 'p2',
          alias: { game_name: 'T1 T1 T1', tag_line: 'OCE' }
        }
      })
    )
    await expect(api.lookupAlias({ gameName: 'T1 T1 T1', tagLine: 'OCE' })).resolves.toMatchObject({
      puuid: 'p2',
      gameName: 'T1 T1 T1',
      tagLine: 'OCE'
    })
  })

  it('lookupAlias accepts a list answer and skips entries without a puuid', async () => {
    const api = createLcuApi(
      clientWith({
        '/lol-summoner/v1/summoners?name=Foo%23BAR': [
          { puuid: 'p3', gameName: 'Foo', tagLine: 'BAR' }
        ]
      })
    )
    await expect(api.lookupAlias({ gameName: 'Foo', tagLine: 'BAR' })).resolves.toMatchObject({
      puuid: 'p3'
    })
  })

  it('debugLookup reports each endpoint with its body or HTTP status', async () => {
    const api = createLcuApi(
      clientWith({ '/lol-summoner/v1/alias/lookup': { puuid: 'p', alias: {} } })
    )
    const out = await api.debugLookup({ gameName: 'a', tagLine: 'b' })
    expect(out).toContain('GET /lol-summoner/v1/summoners?name=a%23b\nHTTP 404')
    expect(out).toContain('"puuid": "p"')
  })

  it('returns [] instead of throwing when champ select payload is malformed', async () => {
    const api = createLcuApi(clientWith({ '/lol-champ-select/v1/session': { nope: true } }))
    await expect(api.getChampSelectPlayers()).resolves.toEqual([])
  })
  it('getMatchHistory maps participants, teams and win using your own puuid', async () => {
    const api = createLcuApi(
      clientWith({
        '/lol-summoner/v1/current-summoner': { puuid: 'me', gameName: 'Blake', tagLine: 'OCE' },
        '/lol-match-history/v1/products/lol/current-summoner/matches': {
          games: {
            games: [
              {
                gameId: 42,
                gameCreation: 1758500000000,
                queueId: 420,
                participantIdentities: [
                  { participantId: 1, player: { puuid: 'me', gameName: 'Blake', tagLine: 'OCE' } },
                  {
                    participantId: 2,
                    player: { puuid: 'them', gameName: 'fockoff', tagLine: 'OCE' }
                  }
                ],
                participants: [
                  { participantId: 1, teamId: 200, championId: 64, stats: { win: true } },
                  { participantId: 2, teamId: 100, championId: 122 }
                ]
              }
            ]
          }
        }
      })
    )
    const [game] = await api.getMatchHistory(5)
    expect(game).toMatchObject({ gameId: '42', queue: 'Ranked Solo', win: true })
    expect(game.players).toEqual([
      { puuid: 'me', gameName: 'Blake', tagLine: 'OCE', team: 'ally' },
      { puuid: 'them', gameName: 'fockoff', tagLine: 'OCE', team: 'enemy' }
    ])
    expect(game.playedAt).toBe(new Date(1758500000000).toISOString())
  })

  it('getMatchHistory returns [] when the endpoint is missing or malformed', async () => {
    await expect(createLcuApi(clientWith({})).getMatchHistory()).resolves.toEqual([])
    const bad = clientWith({
      '/lol-match-history/v1/products/lol/current-summoner/matches': { nope: true }
    })
    await expect(createLcuApi(bad).getMatchHistory()).resolves.toEqual([])
  })
})
