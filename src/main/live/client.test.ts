import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { parsePlayerList, pollPlayerList } from './client'

const list = JSON.parse(readFileSync('test/fixtures/live-playerlist.json', 'utf8'))

describe('parsePlayerList', () => {
  it('marks the active player team as ally and others as enemy', () => {
    const players = parsePlayerList(list, 'Blake#NA1')
    expect(players).toEqual([
      { puuid: null, gameName: 'Blake', tagLine: 'NA1', team: 'ally', championName: 'Lee Sin' },
      { puuid: null, gameName: 'Ally', tagLine: 'NA1', team: 'ally', championName: 'Lux' },
      {
        puuid: null,
        gameName: 'xXDariusMainXx',
        tagLine: '0001',
        team: 'enemy',
        championName: 'Darius'
      }
    ])
  })
  it('returns [] on garbage', () => {
    expect(parsePlayerList({ nope: 1 }, 'a#b')).toEqual([])
  })
})

describe('pollPlayerList', () => {
  it('retries until the game api answers, then resolves players', async () => {
    let calls = 0
    const fetch = vi.fn(async (url: string) => {
      calls++
      if (calls < 3) throw new Error('ECONNREFUSED')
      if (url.endsWith('/activeplayername'))
        return { status: 200, text: async () => JSON.stringify('Blake#NA1') }
      return { status: 200, text: async () => JSON.stringify(list) }
    })
    const sleep = vi.fn(async () => {})
    let t = 0
    const players = await pollPlayerList(
      { fetch, sleep, now: () => (t += 1000) },
      { intervalMs: 1000, timeoutMs: 60000 }
    )
    expect(players).toHaveLength(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })
  it('gives up after timeoutMs and returns null', async () => {
    const fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    })
    let t = 0
    const players = await pollPlayerList(
      { fetch, sleep: async () => {}, now: () => (t += 10000) },
      { timeoutMs: 60000 }
    )
    expect(players).toBeNull()
    expect(fetch.mock.calls.length).toBeLessThanOrEqual(7)
  })
})
