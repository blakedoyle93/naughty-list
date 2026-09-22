import type { RiotId } from '@shared/types'

/** op.gg's own search endpoint. Undocumented, so treat any failure as "no match". */
const ENDPOINT = (region: string, keyword: string): string =>
  `https://op.gg/api/v1.0/internal/bypass/summoners/${encodeURIComponent(region)}/autocomplete?keyword=${encodeURIComponent(keyword)}`

export type Fetcher = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>

/** Riot IDs whose game name matches `name`, exact matches first. */
export async function searchOpgg(
  name: string,
  region: string,
  fetcher: Fetcher = (url) => fetch(url, { headers: { accept: 'application/json' } })
): Promise<RiotId[]> {
  try {
    const res = await fetcher(ENDPOINT(region, name))
    if (!res.ok) return []
    const body = (await res.json()) as { data?: unknown }
    const rows = Array.isArray(body?.data) ? body.data : []
    const hits: RiotId[] = []
    for (const row of rows) {
      const r = row as { game_name?: unknown; tagline?: unknown; tag_line?: unknown }
      const gameName = typeof r.game_name === 'string' ? r.game_name : null
      const tagLine = typeof r.tagline === 'string' ? r.tagline : r.tag_line
      if (gameName && typeof tagLine === 'string' && tagLine) hits.push({ gameName, tagLine })
    }
    const exact = hits.filter((h) => h.gameName.toLowerCase() === name.toLowerCase())
    return [...exact, ...hits.filter((h) => !exact.includes(h))]
  } catch {
    return []
  }
}
