import { describe, it, expect, vi } from 'vitest'
import { GameTracker, type TrackerDeps } from './tracker'
import type { Flag, Player } from '@shared/types'
import type { LcuApi } from '@main/lcu/endpoints'

const flagA: Flag = {
  id: '1',
  crewId: 'c',
  puuid: 'A',
  note: 'ran it down',
  createdBy: 'u',
  createdByName: 'B',
  createdAt: '2026-01-01'
}
const ally: Player = { puuid: 'A', gameName: 'Ally', tagLine: 'NA1', team: 'ally', summonerId: 1 }
const enemyLive: Player = {
  puuid: null,
  gameName: 'Darius',
  tagLine: '0001',
  team: 'enemy',
  championName: 'Darius'
}

function makeDeps(over: Partial<TrackerDeps> = {}): TrackerDeps & { lcu: LcuApi } {
  const lcu: LcuApi = {
    getGameflowPhase: vi.fn(async () => 'None'),
    getGameflowSession: vi.fn(async () => ({ phase: 'ChampSelect', gameId: 'g1' })),
    getChampSelectPlayers: vi.fn(async () => [ally]),
    getEogPlayers: vi.fn(async () => ({
      gameId: 'g1',
      players: [ally, { ...enemyLive, puuid: 'D' }]
    })),
    lookupAlias: vi.fn(async (id) =>
      id.gameName === 'Darius'
        ? { puuid: 'D', gameName: 'Darius', tagLine: '0001', region: null, lastSeenAt: '' }
        : null
    ),
    getSummonerById: vi.fn(async () => null)
  }
  return {
    lcu,
    pollLive: vi.fn(async () => [ally, enemyLive]),
    getFlags: () => [flagA],
    onUpdate: vi.fn(),
    onAlert: vi.fn(),
    onPlayersSeen: vi.fn(),
    ...over
  }
}

describe('GameTracker', () => {
  it('ChampSelect: allies matched, enemies hidden, alert fired once', async () => {
    const deps = makeDeps()
    const t = new GameTracker(deps)
    await t.handlePhase('ChampSelect')
    await t.handlePhase('ChampSelect')
    const { game, hits } = t.current()
    expect(game).toMatchObject({ gameId: 'g1', phase: 'ChampSelect', enemiesHidden: true })
    expect(hits[0].player.puuid).toBe('A')
    expect(deps.onAlert).toHaveBeenCalledTimes(1)
  })

  it('InProgress: resolves live players via alias lookup and alerts new hits only', async () => {
    const deps = makeDeps({
      getFlags: () => [flagA, { ...flagA, id: '2', puuid: 'D', note: 'inted' }]
    })
    const t = new GameTracker(deps)
    await t.handlePhase('ChampSelect')
    await t.handlePhase('InProgress')
    const { game, hits } = t.current()
    expect(game?.enemiesHidden).toBe(false)
    expect(game?.players.find((p) => p.gameName === 'Darius')?.puuid).toBe('D')
    expect(hits.map((h) => h.player.puuid).sort()).toEqual(['A', 'D'])
    expect(deps.onAlert).toHaveBeenCalledTimes(2)
    expect(deps.onPlayersSeen).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ puuid: 'D' })])
    )
  })

  it('EndOfGame: uses eog players', async () => {
    const deps = makeDeps()
    const t = new GameTracker(deps)
    await t.handlePhase('EndOfGame')
    expect(t.current().game?.players).toHaveLength(2)
    expect(deps.lcu.getEogPlayers).toHaveBeenCalled()
  })

  it('Lobby clears the game', async () => {
    const deps = makeDeps()
    const t = new GameTracker(deps)
    await t.handlePhase('ChampSelect')
    await t.handlePhase('Lobby')
    expect(t.current().game).toBeNull()
    expect(deps.onUpdate).toHaveBeenLastCalledWith(null, [])
  })

  it('refreshHits re-matches after flags change', async () => {
    let flags: Flag[] = []
    const deps = makeDeps({ getFlags: () => flags })
    const t = new GameTracker(deps)
    await t.handlePhase('ChampSelect')
    expect(t.current().hits).toHaveLength(0)
    flags = [flagA]
    t.refreshHits()
    expect(t.current().hits).toHaveLength(1)
    expect(deps.onAlert).toHaveBeenCalledTimes(1)
  })
})
