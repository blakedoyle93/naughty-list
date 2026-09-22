import { describe, it, expect } from 'vitest'
import { shouldShowOverlay } from './overlay'
import type { CurrentGame, Hit } from '@shared/types'

const hit: Hit = {
  player: { puuid: 'p1', gameName: 'fockoff', tagLine: 'OCE', team: 'enemy' },
  flags: []
}
const game = (phase: string): CurrentGame => ({
  gameId: 'g1',
  phase,
  players: [hit.player],
  enemiesHidden: false
})

describe('shouldShowOverlay', () => {
  it('shows during champ select, the loading screen and the game itself', () => {
    for (const phase of ['ChampSelect', 'GameStart', 'InProgress', 'Reconnect']) {
      expect(shouldShowOverlay(game(phase), [hit], true)).toBe(true)
    }
  })

  it('stays hidden in the lobby and after the game', () => {
    for (const phase of ['None', 'Lobby', 'Matchmaking', 'EndOfGame', 'WaitingForStats']) {
      expect(shouldShowOverlay(game(phase), [hit], true)).toBe(false)
    }
  })

  it('stays hidden when nobody in the game is on the list', () => {
    expect(shouldShowOverlay(game('InProgress'), [], true)).toBe(false)
  })

  it('stays hidden when there is no game at all', () => {
    expect(shouldShowOverlay(null, [hit], true)).toBe(false)
  })

  it('stays hidden when the setting is off', () => {
    expect(shouldShowOverlay(game('InProgress'), [hit], false)).toBe(false)
  })
})
