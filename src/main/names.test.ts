import { describe, it, expect, vi } from 'vitest'
import { createResolver } from './names'
import type { PastGame, PlayerRecord } from '@shared/types'

const rec = (gameName: string, tagLine: string): PlayerRecord => ({
  puuid: `P-${gameName}-${tagLine}`,
  gameName,
  tagLine,
  region: null,
  lastSeenAt: ''
})

const game = (...players: Array<[string, string]>): PastGame => ({
  gameId: 'g',
  playedAt: '',
  queue: 'Draft',
  win: null,
  players: players.map(([gameName, tagLine]) => ({
    puuid: 'x',
    gameName,
    tagLine,
    team: 'enemy' as const
  }))
})

function deps(
  over: Partial<Parameters<typeof createResolver>[0]> = {}
): Parameters<typeof createResolver>[0] {
  return {
    history: vi.fn(async () => [game(['jared', 'OCE1'], ['fockoff', 'OCE'])]),
    searchOpgg: vi.fn(async () => []),
    lookupAlias: vi.fn(async (id) => rec(id.gameName, id.tagLine)),
    region: 'oce',
    ...over
  }
}

describe('createResolver', () => {
  it('uses a tag the user typed', async () => {
    const r = createResolver(deps())
    await expect(r.resolve('fockoff', '#OCE')).resolves.toMatchObject({
      source: 'given',
      record: { tagLine: 'OCE' }
    })
  })

  it('falls back to your match history when no tag is given', async () => {
    const searchOpgg = vi.fn(async () => [])
    const r = createResolver(deps({ searchOpgg }))
    await expect(r.resolve('JARED', '')).resolves.toMatchObject({
      source: 'history',
      record: { gameName: 'jared', tagLine: 'OCE1' }
    })
    expect(searchOpgg).not.toHaveBeenCalled()
  })

  it('falls back to op.gg for someone you never played with', async () => {
    const searchOpgg = vi.fn(async () => [{ gameName: 'Absurdist', tagLine: '7777' }])
    const r = createResolver(deps({ searchOpgg }))
    await expect(r.resolve('Absurdist', '')).resolves.toMatchObject({
      source: 'opgg',
      record: { tagLine: '7777' }
    })
    expect(searchOpgg).toHaveBeenCalledWith('Absurdist', 'oce')
  })

  it('ignores a typed tag the client rejects and keeps looking', async () => {
    const lookupAlias = vi.fn(async (id) => (id.tagLine === 'WRONG' ? null : rec('jared', 'OCE1')))
    const r = createResolver(deps({ lookupAlias }))
    await expect(r.resolve('jared', 'WRONG')).resolves.toMatchObject({ source: 'history' })
  })

  it('reads history once across calls and returns null when nothing matches', async () => {
    const history = vi.fn(async () => [game(['jared', 'OCE1'])])
    const r = createResolver(deps({ history }))
    await r.resolve('jared', '')
    await expect(r.resolve('ghost', '')).resolves.toBeNull()
    expect(history).toHaveBeenCalledTimes(1)
  })

  it('candidates prefers history and only asks op.gg when it has nothing', async () => {
    const searchOpgg = vi.fn(async () => [{ gameName: 'ghost', tagLine: '1' }])
    const r = createResolver(deps({ searchOpgg }))
    await expect(r.candidates('jared')).resolves.toEqual([{ gameName: 'jared', tagLine: 'OCE1' }])
    expect(searchOpgg).not.toHaveBeenCalled()
    await expect(r.candidates('ghost')).resolves.toEqual([{ gameName: 'ghost', tagLine: '1' }])
  })
})
