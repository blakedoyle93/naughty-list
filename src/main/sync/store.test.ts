import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { FlagStore } from './store'

const row = {
  id: 'f1',
  crew_id: 'c1',
  puuid: 'P1',
  note: 'inted',
  created_by: 'u1',
  created_by_name: 'Blake',
  created_at: '2026-09-22T00:00:00Z'
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function mockSupabase(opts: { online?: boolean } = {}) {
  const online = opts.online ?? true
  const tables: Record<string, unknown[]> = {
    flags: [row],
    players: [],
    crew_members: [{ user_id: 'u1', discord_name: 'Blake' }]
  }
  const from = vi.fn((table: string) => {
    let single = false
    const q = {
      select: vi.fn(() => q),
      eq: vi.fn(() => q),
      in: vi.fn(() => q),
      order: vi.fn(() => q),
      single: vi.fn(() => {
        single = true
        return q
      }),
      insert: vi.fn((v: Record<string, unknown>) => {
        tables[table].push({ ...row, ...v, id: 'new' })
        return q
      }),
      upsert: vi.fn(() => q),
      delete: vi.fn(() => q),
      then: (res: (v: unknown) => void, rej: (e: unknown) => void) => {
        if (!online) return rej(new Error('offline'))
        const rows = tables[table]
        return res({ data: single ? rows[rows.length - 1] : rows, error: null })
      }
    }
    return q
  })
  const rpc = vi.fn(async (name: string) => ({
    data: name === 'my_crew' ? { id: 'c1', name: 'Crew', invite_code: 'ABC12345' } : null,
    error: online ? null : new Error('offline')
  }))
  const channel = vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis()
  }))
  return {
    from,
    rpc,
    channel,
    removeChannel: vi.fn(),
    auth: { getSession: vi.fn(async () => ({ data: { session: { user: { id: 'u1' } } } })) },
    _tables: tables
  }
}

const tmp = (): string => join(mkdtempSync(join(tmpdir(), 'nl-')), 'cache.json')

describe('FlagStore', () => {
  it('start() loads from server and caches to disk', async () => {
    const file = tmp()
    const sb = mockSupabase()
    const onFlagsChanged = vi.fn()
    const s = new FlagStore({
      supabase: sb as never,
      cacheFile: file,
      onFlagsChanged,
      onStatus: vi.fn()
    })
    await s.start()
    expect(s.flags()).toEqual([
      {
        id: 'f1',
        crewId: 'c1',
        puuid: 'P1',
        note: 'inted',
        createdBy: 'u1',
        createdByName: 'Blake',
        createdAt: '2026-09-22T00:00:00Z'
      }
    ])
    expect(onFlagsChanged).toHaveBeenCalled()

    const offline = new FlagStore({
      supabase: mockSupabase({ online: false }) as never,
      cacheFile: file,
      onFlagsChanged: vi.fn(),
      onStatus: vi.fn()
    })
    await offline.start()
    expect(offline.flags()).toHaveLength(1)
    expect(offline.status().online).toBe(false)
  })

  it('addFlag inserts and returns mapped flag', async () => {
    const sb = mockSupabase()
    const s = new FlagStore({
      supabase: sb as never,
      cacheFile: tmp(),
      onFlagsChanged: vi.fn(),
      onStatus: vi.fn()
    })
    await s.start()
    const f = await s.addFlag(
      { puuid: 'P2', note: 'afk' },
      { puuid: 'P2', gameName: 'X', tagLine: 'Y', region: null, lastSeenAt: '' }
    )
    expect(f).toMatchObject({ puuid: 'P2', note: 'afk', crewId: 'c1' })
    expect(sb.from).toHaveBeenCalledWith('players')
    expect(s.flags().some((x) => x.puuid === 'P2')).toBe(true)
  })

  it('upsertPlayers queues when offline and reports pending writes', async () => {
    const onStatus = vi.fn()
    const s = new FlagStore({
      supabase: mockSupabase({ online: false }) as never,
      cacheFile: tmp(),
      onFlagsChanged: vi.fn(),
      onStatus
    })
    await s.start()
    await s.upsertPlayers([
      { puuid: 'P9', gameName: 'A', tagLine: 'B', region: null, lastSeenAt: '' }
    ])
    expect(s.status().pendingWrites).toBe(1)
    // cached anyway, so the list shows the name instead of the puuid
    expect(s.players()).toMatchObject([{ puuid: 'P9', gameName: 'A', tagLine: 'B' }])
  })

  it('upsertPlayers replaces an existing record rather than duplicating it', async () => {
    const s = new FlagStore({
      supabase: mockSupabase({}) as never,
      cacheFile: tmp(),
      onFlagsChanged: vi.fn(),
      onStatus: vi.fn()
    })
    await s.start()
    const rec = { puuid: 'P9', gameName: 'A', tagLine: 'B', region: null, lastSeenAt: '' }
    await s.upsertPlayers([rec])
    await s.upsertPlayers([{ ...rec, gameName: 'Renamed' }])
    expect(s.players().filter((p) => p.puuid === 'P9')).toMatchObject([{ gameName: 'Renamed' }])
  })
})
