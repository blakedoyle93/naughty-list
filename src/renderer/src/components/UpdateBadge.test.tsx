// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UpdateBadge } from './UpdateBadge'
import type { UpdateStatus } from '@shared/types'

const base: UpdateStatus = {
  version: '0.2.1',
  state: 'idle',
  latest: null,
  canSelfUpdate: true,
  message: null
}

function mount(status: Partial<UpdateStatus>, invoke = vi.fn()): void {
  window.naughty = {
    invoke: vi.fn(async (ch: string, ...args: unknown[]) => {
      invoke(ch, ...args)
      return ch === 'update:get' || ch === 'update:check' ? { ...base, ...status } : undefined
    }),
    on: vi.fn(() => () => {})
  } as never
  render(<UpdateBadge />)
}

beforeEach(() => vi.clearAllMocks())

describe('UpdateBadge', () => {
  it('shows the running version and lets you check', async () => {
    const invoke = vi.fn()
    mount({ state: 'current', latest: '0.2.1' }, invoke)
    expect(await screen.findByText('v0.2.1')).toBeInTheDocument()
    expect(screen.getByText(/you have the latest/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /check again/i }))
    expect(invoke).toHaveBeenCalledWith('update:check')
  })

  it('offers a restart once an update is downloaded', async () => {
    const invoke = vi.fn()
    mount({ state: 'ready', latest: '0.3.0' }, invoke)
    await userEvent.click(await screen.findByRole('button', { name: /restart to update/i }))
    expect(invoke).toHaveBeenCalledWith('update:install')
    expect(screen.queryByRole('button', { name: /check again/i })).not.toBeInTheDocument()
  })

  it('links to the release when it cannot install itself', async () => {
    const invoke = vi.fn()
    mount({ state: 'available', latest: '0.3.0', canSelfUpdate: false }, invoke)
    expect(await screen.findByText(/a new version is out \(v0\.3\.0\)/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /download v0\.3\.0/i }))
    expect(invoke).toHaveBeenCalledWith('update:openReleases')
  })

  it('says so when the check fails', async () => {
    mount({ state: 'error', message: 'no releases' })
    expect(await screen.findByText(/couldn't check/i)).toBeInTheDocument()
  })
})
