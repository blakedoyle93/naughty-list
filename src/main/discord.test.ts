import { describe, it, expect, vi } from 'vitest'
import { isDiscordWebhook, buildMessage, postAlert, isAlertPhase, alertKey } from './discord'
import type { CurrentGame, Flag, Hit } from '@shared/types'

const flag = (note: string, by = 'Blake'): Flag => ({
  id: 'f1',
  crewId: 'c1',
  puuid: 'p1',
  note,
  createdBy: 'u1',
  createdByName: by,
  createdAt: '2026-01-01T00:00:00.000Z'
})

const hit = (gameName: string, team: 'ally' | 'enemy', note: string): Hit => ({
  player: { puuid: gameName, gameName, tagLine: 'OCE', team },
  flags: [flag(note)]
})

const game = (phase: string): CurrentGame => ({
  gameId: 'g1',
  phase,
  players: [],
  enemiesHidden: false
})

const ok = { ok: true, status: 204 } as Response
const deps = (fetchImpl: typeof globalThis.fetch): Parameters<typeof postAlert>[0] => ({
  fetch: fetchImpl,
  log: vi.fn()
})

describe('isDiscordWebhook', () => {
  it('accepts the real webhook hosts', () => {
    for (const host of ['discord.com', 'discordapp.com', 'ptb.discord.com', 'canary.discord.com']) {
      expect(isDiscordWebhook(`https://${host}/api/webhooks/123/abc`)).toBe(true)
    }
  })

  it('accepts a url with stray whitespace from a paste', () => {
    expect(isDiscordWebhook('  https://discord.com/api/webhooks/123/abc \n')).toBe(true)
  })

  it('rejects anywhere else, plain http, and a non-webhook discord path', () => {
    expect(isDiscordWebhook('https://evil.example/api/webhooks/1/a')).toBe(false)
    expect(isDiscordWebhook('http://discord.com/api/webhooks/1/a')).toBe(false)
    expect(isDiscordWebhook('https://discord.com/channels/1/2')).toBe(false)
    expect(isDiscordWebhook('not a url')).toBe(false)
    expect(isDiscordWebhook('')).toBe(false)
  })

  it('rejects a host that merely ends with the discord domain', () => {
    expect(isDiscordWebhook('https://discord.com.evil.example/api/webhooks/1/a')).toBe(false)
  })
})

describe('isAlertPhase', () => {
  it('shouts while the game is live', () => {
    for (const p of ['ChampSelect', 'GameStart', 'InProgress', 'Reconnect']) {
      expect(isAlertPhase(p)).toBe(true)
    }
  })

  it('stays quiet once the game is over, which is what double-posted before', () => {
    for (const p of ['EndOfGame', 'PreEndOfGame', 'WaitingForStats', 'Lobby', 'None']) {
      expect(isAlertPhase(p)).toBe(false)
    }
  })
})

describe('alertKey', () => {
  it('is the same for the same players however the client orders them', () => {
    const a = [hit('fockoff', 'enemy', 'n'), hit('jared', 'ally', 'n')]
    expect(alertKey(a)).toBe(alertKey([...a].reverse()))
  })

  it('differs when a different player is flagged', () => {
    expect(alertKey([hit('fockoff', 'enemy', 'n')])).not.toBe(alertKey([hit('jared', 'ally', 'n')]))
  })
})

describe('buildMessage', () => {
  it('says the headline once, and not again in the embed', () => {
    const m = buildMessage(game('ChampSelect'), [hit('keen for bed', 'ally', 'AP ashe')])
    expect(m.content).toBe('\u{1F6A8} **NAUGHTY GAYMER ALERT** \u{1F6A8}')
    expect(m.embeds[0]).not.toHaveProperty('title')
    expect(m.embeds[0].description).not.toContain('NAUGHTY')
  })

  it('names the player, their side, the note and who wrote it', () => {
    const m = buildMessage(game('ChampSelect'), [hit('fockoff', 'enemy', 'dodges every game')])
    expect(m.embeds[0].description).toBe(
      '**fockoff#OCE** _(against us)_\n> dodges every game \u2014 Blake'
    )
    expect(m.embeds[0].footer.text).toBe('Spotted in champ select')
  })

  it('lists every note on a player, not just the first', () => {
    const many: Hit = {
      player: { puuid: 'p1', gameName: 'keen for bed', tagLine: 'keen4', team: 'ally' },
      flags: [flag('AP ashe', 'Blake'), flag('never wards', 'Yong')]
    }
    const d = buildMessage(game('InProgress'), [many]).embeds[0].description
    expect(d).toContain('> AP ashe \u2014 Blake')
    expect(d).toContain('> never wards \u2014 Yong')
  })

  it('separates two players', () => {
    const d = buildMessage(game('InProgress'), [
      hit('fockoff', 'enemy', 'dodges'),
      hit('jared', 'ally', 'int feeds')
    ]).embeds[0].description
    expect(d).toContain('**fockoff#OCE** _(against us)_')
    expect(d).toContain('**jared#OCE** _(on our team)_')
  })

  it('says so when nobody left a reason', () => {
    const bare: Hit = { player: hit('x', 'ally', '').player, flags: [] }
    expect(buildMessage(game('GameStart'), [bare]).embeds[0].description).toContain(
      'no reason given'
    )
  })
})

describe('postAlert', () => {
  it('posts the message as json', async () => {
    const f = vi.fn(async () => ok) as unknown as typeof globalThis.fetch
    const res = await postAlert(
      deps(f),
      'https://discord.com/api/webhooks/1/a',
      game('InProgress'),
      [hit('fockoff', 'enemy', 'dodges')]
    )
    expect(res).toBe('sent')
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://discord.com/api/webhooks/1/a')
    expect(JSON.parse(init.body).content).toContain('NAUGHTY GAYMER ALERT')
  })

  it('refuses a url that is not a discord webhook', async () => {
    const f = vi.fn(async () => ok) as unknown as typeof globalThis.fetch
    const res = await postAlert(deps(f), 'https://evil.example/hook', game('InProgress'), [
      hit('x', 'ally', 'n')
    ])
    expect(res).toBe('bad-webhook')
    expect(f).not.toHaveBeenCalled()
  })

  it('refuses to post once the game is over', async () => {
    const f = vi.fn(async () => ok) as unknown as typeof globalThis.fetch
    const res = await postAlert(
      deps(f),
      'https://discord.com/api/webhooks/1/a',
      game('EndOfGame'),
      [hit('fockoff', 'enemy', 'dodges')]
    )
    expect(res).toBe('nothing-to-say')
    expect(f).not.toHaveBeenCalled()
  })

  it('does nothing when no webhook is set, or when nobody is flagged', async () => {
    const f = vi.fn(async () => ok) as unknown as typeof globalThis.fetch
    expect(await postAlert(deps(f), null, game('InProgress'), [hit('x', 'ally', 'n')])).toBe(
      'no-webhook'
    )
    expect(
      await postAlert(deps(f), 'https://discord.com/api/webhooks/1/a', game('InProgress'), [])
    ).toBe('nothing-to-say')
    expect(f).not.toHaveBeenCalled()
  })

  it('reports a refusal from discord instead of throwing', async () => {
    const f = vi.fn(
      async () => ({ ok: false, status: 404 }) as Response
    ) as unknown as typeof globalThis.fetch
    expect(
      await postAlert(deps(f), 'https://discord.com/api/webhooks/1/a', game('InProgress'), [
        hit('x', 'ally', 'n')
      ])
    ).toBe('failed')
  })

  it('survives the network being down', async () => {
    const f = vi.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof globalThis.fetch
    expect(
      await postAlert(deps(f), 'https://discord.com/api/webhooks/1/a', game('InProgress'), [
        hit('x', 'ally', 'n')
      ])
    ).toBe('failed')
  })
})
