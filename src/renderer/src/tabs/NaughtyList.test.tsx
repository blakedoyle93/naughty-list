// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NaughtyList } from './NaughtyList'
import type { Flag } from '@shared/types'

const flags: Flag[] = [
  {
    id: '1',
    crewId: 'c',
    puuid: 'D',
    note: 'inted',
    createdBy: 'me',
    createdByName: 'Blake',
    createdAt: '2026-09-22T00:00:00Z'
  },
  {
    id: '2',
    crewId: 'c',
    puuid: 'E',
    note: 'afk',
    createdBy: 'other',
    createdByName: 'Friend',
    createdAt: '2026-09-21T00:00:00Z'
  }
]

beforeEach(() => {
  window.naughty = {
    invoke: vi.fn(async (ch: string, ...args: unknown[]) => {
      if (ch === 'players:list')
        return [
          { puuid: 'D', gameName: 'Darius', tagLine: '0001', region: null, lastSeenAt: '' },
          { puuid: 'E', gameName: 'Ezreal', tagLine: 'NA1', region: null, lastSeenAt: '' }
        ]
      if (ch === 'players:lookup')
        return {
          puuid: 'N',
          gameName: (args[0] as { gameName: string }).gameName,
          tagLine: 'TAG',
          region: null,
          lastSeenAt: ''
        }
      return null
    }),
    on: vi.fn(() => () => {})
  } as never
})

describe('NaughtyList', () => {
  it('lists players with notes and filters by search', async () => {
    render(<NaughtyList flags={flags} onAdd={vi.fn()} onRemove={vi.fn()} userId="me" />)
    expect(await screen.findByText('Darius#0001')).toBeInTheDocument()
    await userEvent.type(screen.getByPlaceholderText(/search/i), 'ezr')
    expect(screen.queryByText('Darius#0001')).not.toBeInTheDocument()
    expect(screen.getByText('Ezreal#NA1')).toBeInTheDocument()
  })
  it('only shows delete on own notes', async () => {
    const onRemove = vi.fn()
    render(<NaughtyList flags={flags} onAdd={vi.fn()} onRemove={onRemove} userId="me" />)
    await screen.findByText('Darius#0001')
    const dels = screen.getAllByRole('button', { name: /forgive/i })
    expect(dels).toHaveLength(1)
    await userEvent.click(dels[0])
    expect(onRemove).toHaveBeenCalledWith('1')
  })
  it('adds by riot id via lookup', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    render(<NaughtyList flags={[]} onAdd={onAdd} onRemove={vi.fn()} userId="me" />)
    await userEvent.type(screen.getByLabelText('Game name'), 'NewGuy')
    await userEvent.clear(screen.getByLabelText('Tag'))
    await userEvent.type(screen.getByLabelText('Tag'), 'TAG')
    await userEvent.type(screen.getByPlaceholderText(/what did they do/i), 'griefed')
    await userEvent.click(screen.getByRole('button', { name: /add to list/i }))
    expect(onAdd).toHaveBeenCalledWith('N', 'griefed')
  })
  it('splits a pasted Name#TAG across the two boxes', async () => {
    render(<NaughtyList flags={[]} onAdd={vi.fn()} onRemove={vi.fn()} userId="me" />)
    await userEvent.click(screen.getByLabelText('Game name'))
    await userEvent.paste('T1 T1 T1#OCE')
    expect(screen.getByLabelText('Game name')).toHaveValue('T1 T1 T1')
    expect(screen.getByLabelText('Tag')).toHaveValue('OCE')
  })
  it('imports a pasted list and reports misses', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    ;(window.naughty.invoke as ReturnType<typeof vi.fn>).mockImplementation(
      async (ch: string, ...args: unknown[]) => {
        if (ch === 'players:list') return []
        if (ch === 'players:lookup') {
          const id = args[0] as { gameName: string; tagLine: string }
          return id.gameName === 'ghost'
            ? null
            : { puuid: `P-${id.gameName}`, ...id, region: null, lastSeenAt: '' }
        }
        return null
      }
    )
    render(<NaughtyList flags={[]} onAdd={onAdd} onRemove={vi.fn()} userId="me" />)
    await userEvent.click(screen.getByText(/paste it here/i))
    await userEvent.type(
      screen.getByPlaceholderText(/fockoff/i),
      'a#OCE - inted{enter}ghost#OCE - afk{enter}b - x'
    )
    await userEvent.click(screen.getByRole('button', { name: /add them all/i }))
    expect(await screen.findByText(/added 2/i)).toBeInTheDocument()
    expect(onAdd).toHaveBeenCalledWith('P-a', 'inted')
    expect(onAdd).toHaveBeenCalledWith('P-b', 'x')
    expect(screen.getByText(/couldn't find/i)).toHaveTextContent('ghost#OCE')
  })
})
