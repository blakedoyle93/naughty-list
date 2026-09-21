// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CurrentGame } from './CurrentGame'
import type { CurrentGame as Game, Hit } from '@shared/types'

const game: Game = {
  gameId: 'g1',
  phase: 'InProgress',
  enemiesHidden: false,
  players: [
    { puuid: 'A', gameName: 'Ally', tagLine: 'NA1', team: 'ally', championName: 'Lux' },
    { puuid: 'D', gameName: 'Darius', tagLine: '0001', team: 'enemy', championName: 'Darius' }
  ]
}
const hits: Hit[] = [
  {
    player: game.players[1],
    flags: [
      {
        id: '1',
        crewId: 'c',
        puuid: 'D',
        note: 'inted',
        createdBy: 'u',
        createdByName: 'Blake',
        createdAt: '2026-09-22T00:00:00Z'
      }
    ]
  }
]

describe('CurrentGame', () => {
  it('shows disconnected state', () => {
    render(<CurrentGame game={null} hits={[]} lcu="disconnected" onFlag={vi.fn()} />)
    expect(screen.getByText(/league client not detected/i)).toBeInTheDocument()
  })
  it('highlights flagged players with notes', () => {
    render(<CurrentGame game={game} hits={hits} lcu="connected" onFlag={vi.fn()} />)
    expect(screen.getByText(/Darius#0001/)).toBeInTheDocument()
    expect(screen.getByText(/inted/)).toBeInTheDocument()
    expect(screen.getByText(/Blake/)).toBeInTheDocument()
  })
  it('explains hidden enemies during champ select', () => {
    render(
      <CurrentGame
        game={{ ...game, phase: 'ChampSelect', enemiesHidden: true, players: [game.players[0]] }}
        hits={[]}
        lcu="connected"
        onFlag={vi.fn()}
      />
    )
    expect(screen.getByText(/enemies hidden by riot until loading screen/i)).toBeInTheDocument()
  })
  it('lets you flag a player in EndOfGame', async () => {
    const onFlag = vi.fn().mockResolvedValue(undefined)
    render(
      <CurrentGame
        game={{ ...game, phase: 'EndOfGame' }}
        hits={[]}
        lcu="connected"
        onFlag={onFlag}
      />
    )
    await userEvent.click(screen.getAllByRole('button', { name: /flag/i })[1])
    await userEvent.type(screen.getByPlaceholderText(/what did they do/i), 'ran it down')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(onFlag).toHaveBeenCalledWith('D', 'ran it down')
  })
})
