import { describe, it, expect, vi } from 'vitest'
import { searchOpgg } from './opgg'

const res = (body: unknown, ok = true): { ok: boolean; json(): Promise<unknown> } => ({
  ok,
  json: async () => body
})

describe('searchOpgg', () => {
  it('returns riot ids with exact name matches first', async () => {
    const fetcher = vi.fn(async () =>
      res({
        data: [
          { game_name: 'jaredsmurf', tagline: 'OCE' },
          { game_name: 'jared', tagline: '1234' }
        ]
      })
    )
    await expect(searchOpgg('jared', 'oce', fetcher)).resolves.toEqual([
      { gameName: 'jared', tagLine: '1234' },
      { gameName: 'jaredsmurf', tagLine: 'OCE' }
    ])
    expect(fetcher.mock.calls[0][0]).toContain('/summoners/oce/autocomplete?keyword=jared')
  })

  it('skips rows without a tag and survives junk, errors and non-200s', async () => {
    await expect(
      searchOpgg('x', 'oce', async () => res({ data: [{ game_name: 'x' }, { nope: 1 }] }))
    ).resolves.toEqual([])
    await expect(searchOpgg('x', 'oce', async () => res({}, false))).resolves.toEqual([])
    await expect(
      searchOpgg('x', 'oce', async () => {
        throw new Error('offline')
      })
    ).resolves.toEqual([])
  })
})
