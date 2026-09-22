import type { CurrentGame, Hit } from '@shared/types'

/**
 * Only real Discord webhooks. The URL comes from the crew row in Supabase, so
 * this is the gate that stops a bad row turning the app into an outbound
 * request to anywhere.
 */
export function isDiscordWebhook(url: string): boolean {
  try {
    const u = new URL(url.trim())
    if (u.protocol !== 'https:') return false
    if (
      !['discord.com', 'discordapp.com', 'ptb.discord.com', 'canary.discord.com'].includes(u.host)
    )
      return false
    return u.pathname.startsWith('/api/webhooks/')
  } catch {
    return false
  }
}

const PHASE_WORDS: Record<string, string> = {
  ChampSelect: 'in champ select',
  GameStart: 'on the loading screen',
  InProgress: 'in the game',
  Reconnect: 'in the game'
}

export interface DiscordMessage {
  username: string
  /** Plain text, because this is what Discord puts in the push notification. */
  content: string
  embeds: Array<{
    title: string
    description: string
    color: number
    footer: { text: string }
  }>
}

/** Red, to match the crayon the app writes names in. */
const CRAYON_RED = 0xe23d32

const SIREN = '\u{1F6A8}'

export function buildMessage(game: CurrentGame, hits: Hit[]): DiscordMessage {
  const where = PHASE_WORDS[game.phase] ?? 'in a game'
  const headline = `${SIREN} **NAUGHTY GAYMER ALERT** ${SIREN}`

  const lines = hits.map((hit) => {
    const { gameName, tagLine, team } = hit.player
    const side = team === 'ally' ? 'on our team' : 'against us'
    const note = hit.flags[0]?.note ?? 'no reason given'
    const who = hit.flags[0]?.createdByName
    const by = who ? ` — ${who}` : ''
    return `**${gameName}#${tagLine}** - ${note} _(${side})_${by}`
  })

  return {
    username: 'Naughty List',
    content: `${headline}\n${hits.map((h) => h.player.gameName).join(', ')}`,
    embeds: [
      {
        title: `${SIREN} Naughty gaymer alert ${SIREN}`,
        description: lines.join('\n\n'),
        color: CRAYON_RED,
        footer: { text: `Spotted ${where}` }
      }
    ]
  }
}

export type PostResult = 'sent' | 'no-webhook' | 'bad-webhook' | 'nothing-to-say' | 'failed'

export interface PostDeps {
  fetch: typeof globalThis.fetch
  log: (message: string, data?: unknown) => void
}

/** Fire-and-forget: a Discord outage must never hold up the game tracker. */
export async function postAlert(
  deps: PostDeps,
  webhookUrl: string | null,
  game: CurrentGame | null,
  hits: Hit[]
): Promise<PostResult> {
  if (!webhookUrl) return 'no-webhook'
  if (!isDiscordWebhook(webhookUrl)) {
    deps.log('that webhook url is not a discord one, refusing to post')
    return 'bad-webhook'
  }
  if (!game || hits.length === 0) return 'nothing-to-say'

  try {
    const res = await deps.fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildMessage(game, hits))
    })
    if (!res.ok) {
      deps.log(`discord said no: ${res.status}`)
      return 'failed'
    }
    deps.log(`posted ${hits.length} to discord`)
    return 'sent'
  } catch (e) {
    deps.log('could not reach discord', String(e))
    return 'failed'
  }
}
