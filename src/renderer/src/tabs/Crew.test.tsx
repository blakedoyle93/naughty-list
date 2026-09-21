// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Crew } from './Crew'
import type { AuthState } from '../hooks/useAuth'

const auth = (user: { id: string; discordName: string } | null): AuthState => ({
  user,
  signIn: vi.fn(),
  signOut: vi.fn(),
  loading: false
})

beforeEach(() => {
  window.naughty = {
    invoke: vi.fn(async (ch: string, ...args: unknown[]) => {
      if (ch === 'crew:get') return null
      if (ch === 'crew:join') return { id: 'c', name: 'Boys', inviteCode: args[0] }
      if (ch === 'sync:status') return { online: true, pendingWrites: 0, lastSyncedAt: null }
      if (ch === 'settings:get') return { lockfilePath: null }
      return null
    }),
    on: vi.fn(() => () => {})
  } as never
})

describe('Crew', () => {
  it('prompts sign in when signed out', () => {
    render(<Crew auth={auth(null)} />)
    expect(screen.getByRole('button', { name: /sign in with discord/i })).toBeInTheDocument()
  })
  it('joins a crew with an invite code', async () => {
    render(<Crew auth={auth({ id: 'u', discordName: 'Blake' })} />)
    await userEvent.type(await screen.findByPlaceholderText(/invite code/i), 'ABC12345')
    await userEvent.click(screen.getByRole('button', { name: /^join$/i }))
    expect(window.naughty.invoke).toHaveBeenCalledWith('crew:join', 'ABC12345')
  })
})
