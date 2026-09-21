import { describe, it, expect } from 'vitest'
import { matchPlayers, AlertDeduper } from './matcher'
import type { Flag, Player } from '@shared/types'

const flag = (puuid: string, note: string, id = puuid + note): Flag => ({
  id,
  crewId: 'c',
  puuid,
  note,
  createdBy: 'u',
  createdByName: 'Blake',
  createdAt: '2026-09-22T00:00:00Z'
})
const player = (puuid: string | null, gameName = 'x'): Player => ({
  puuid,
  gameName,
  tagLine: 'NA1',
  team: 'enemy'
})

describe('matchPlayers', () => {
  it('groups all flags for a matched puuid, newest first', () => {
    const hits = matchPlayers(
      [player('a'), player('b')],
      [
        flag('a', 'old', '1'),
        { ...flag('a', 'new', '2'), createdAt: '2026-09-23T00:00:00Z' },
        flag('z', 'unrelated')
      ]
    )
    expect(hits).toHaveLength(1)
    expect(hits[0].player.puuid).toBe('a')
    expect(hits[0].flags.map((f) => f.note)).toEqual(['new', 'old'])
  })
  it('ignores players without puuid', () => {
    expect(matchPlayers([player(null)], [flag('a', 'n')])).toEqual([])
  })
})

describe('AlertDeduper', () => {
  it('only returns new hits for the same game', () => {
    const d = new AlertDeduper()
    const h1 = matchPlayers([player('a')], [flag('a', 'n')])
    expect(d.take('g1', h1)).toHaveLength(1)
    expect(d.take('g1', h1)).toHaveLength(0)
    const h2 = matchPlayers([player('a'), player('b')], [flag('a', 'n'), flag('b', 'n')])
    expect(d.take('g1', h2).map((h) => h.player.puuid)).toEqual(['b'])
  })
  it('resets when the game changes', () => {
    const d = new AlertDeduper()
    const h = matchPlayers([player('a')], [flag('a', 'n')])
    d.take('g1', h)
    expect(d.take('g2', h)).toHaveLength(1)
  })
})
