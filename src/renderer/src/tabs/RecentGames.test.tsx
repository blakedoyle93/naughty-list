// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RecentGames } from './RecentGames'
import type { Flag, PastGame } from '@shared/types'

const games: PastGame[] = [
  {
    gameId: 'g1',
    playedAt: '2026-09-21T00:00:00Z',
    queue: 'Ranked Solo',
    win: false,
    players: [
      { puuid: 'me', gameName: 'Blake', tagLine: 'OCE', team: 'ally' },
      { puuid: 'bad', gameName: 'fockoff', tagLine: 'OCE', team: 'enemy' },
      { puuid: 'known', gameName: 'jared', tagLine: 'OCE1', team: 'enemy' }
    ]
  }
]

const flags: Flag[] = [
  {
    id: 'f1',
    crewId: 'c',
    puuid: 'known',
    note: 'inted',
    createdBy: 'me',
    createdByName: 'Blake',
    createdAt: '2026-09-20T00:00:00Z'
  }
]

beforeEach(() => {
  window.naughty = {
    invoke: vi.fn(async (ch: string) => (ch === 'history:list' ? games : null)),
    on: vi.fn(() => () => {})
  } as never
})

describe('RecentGames', () => {
  it('lists games and reveals both teams on click', async () => {
    render(<RecentGames flags={[]} onAdd={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: /who played/i }))
    expect(screen.getByText('Us')).toBeInTheDocument()
    expect(screen.getByText('Blake#OCE')).toBeInTheDocument()
    expect(screen.getByText('fockoff#OCE')).toBeInTheDocument()
  })

  it('adds a flag straight from a game without typing a name', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    render(<RecentGames flags={[]} onAdd={onAdd} />)
    await userEvent.click(await screen.findByRole('button', { name: /who played/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Tell on fockoff#OCE' }))
    await userEvent.type(screen.getByLabelText('What did fockoff#OCE do?'), 'saying ez')
    await userEvent.click(screen.getByRole('button', { name: /add to list/i }))
    expect(onAdd).toHaveBeenCalledWith('bad', 'saying ez')
  })

  it('marks people already on the list instead of offering to add them', async () => {
    render(<RecentGames flags={flags} onAdd={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: /who played/i }))
    expect(screen.getByText(/already on the list/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tell on jared#OCE1' })).not.toBeInTheDocument()
  })

  it('explains an empty history', async () => {
    window.naughty = {
      invoke: vi.fn(async () => []),
      on: vi.fn(() => () => {})
    } as never
    render(<RecentGames flags={[]} onAdd={vi.fn()} />)
    expect(await screen.findByText(/no games to show/i)).toBeInTheDocument()
  })
})
