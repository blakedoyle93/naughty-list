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
        '/lol-summoner/v1/alias/lookup': { puuid: 'p1', gameName: 'Foo', tagLine: 'BAR' }
      })
    )
    const rec = await ok.lookupAlias({ gameName: 'Foo', tagLine: 'BAR' })
    expect(rec).toMatchObject({ puuid: 'p1', gameName: 'Foo', tagLine: 'BAR', region: null })
    const missing = createLcuApi(clientWith({}))
    await expect(missing.lookupAlias({ gameName: 'x', tagLine: 'y' })).resolves.toBeNull()
  })

  it('returns [] instead of throwing when champ select payload is malformed', async () => {
    const api = createLcuApi(clientWith({ '/lol-champ-select/v1/session': { nope: true } }))
    await expect(api.getChampSelectPlayers()).resolves.toEqual([])
  })
})
