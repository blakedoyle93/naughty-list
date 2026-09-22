import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type { Crew, CrewMember, Flag, PlayerRecord, SyncStatus } from '@shared/types'

interface FlagRow {
  id: string
  crew_id: string
  puuid: string
  note: string
  created_by: string
  created_by_name: string
  created_at: string
}
interface PlayerRow {
  puuid: string
  game_name: string
  tag_line: string
  region: string | null
  last_seen_at: string
}
interface CrewRow {
  id: string
  name: string
  invite_code: string
}

interface Cache {
  crew: Crew | null
  flags: Flag[]
  players: PlayerRecord[]
  lastSyncedAt: string | null
}
type Pending = { kind: 'upsertPlayers'; players: PlayerRecord[] }

const mapFlag = (r: FlagRow): Flag => ({
  id: r.id,
  crewId: r.crew_id,
  puuid: r.puuid,
  note: r.note,
  createdBy: r.created_by,
  createdByName: r.created_by_name,
  createdAt: r.created_at
})
const mapPlayer = (r: PlayerRow): PlayerRecord => ({
  puuid: r.puuid,
  gameName: r.game_name,
  tagLine: r.tag_line,
  region: r.region,
  lastSeenAt: r.last_seen_at
})
const mapCrew = (r: CrewRow): Crew => ({ id: r.id, name: r.name, inviteCode: r.invite_code })
const toPlayerRow = (p: PlayerRecord): PlayerRow => ({
  puuid: p.puuid,
  game_name: p.gameName,
  tag_line: p.tagLine,
  region: p.region,
  last_seen_at: new Date().toISOString()
})

/**
 * Crew flags, cached on disk so matching works offline. Realtime keeps the cache
 * fresh while online; failed player upserts queue and retry on the next refresh.
 */
export class FlagStore {
  private cache: Cache = { crew: null, flags: [], players: [], lastSyncedAt: null }
  private pending: Pending[] = []
  private online = false
  private channel: RealtimeChannel | null = null

  constructor(
    private readonly deps: {
      supabase: SupabaseClient
      cacheFile: string
      onFlagsChanged: (flags: Flag[]) => void
      onStatus: (s: SyncStatus) => void
    }
  ) {}

  flags(): Flag[] {
    return this.cache.flags
  }
  players(): PlayerRecord[] {
    return this.cache.players
  }
  status(): SyncStatus {
    return {
      online: this.online,
      pendingWrites: this.pending.length,
      lastSyncedAt: this.cache.lastSyncedAt
    }
  }

  async start(): Promise<void> {
    this.loadCache()
    this.deps.onFlagsChanged(this.cache.flags)
    await this.refresh()
  }

  stop(): void {
    if (this.channel) void this.deps.supabase.removeChannel(this.channel)
    this.channel = null
  }

  async refresh(): Promise<void> {
    try {
      const { data: session } = await this.deps.supabase.auth.getSession()
      if (!session.session) {
        this.setOnline(true)
        return
      }
      const crewRes = await this.deps.supabase.rpc('my_crew')
      if (crewRes.error) throw crewRes.error
      const crew = crewRes.data ? mapCrew(crewRes.data as CrewRow) : null
      let flags: Flag[] = []
      if (crew) {
        const f = await this.deps.supabase
          .from('flags')
          .select('*')
          .eq('crew_id', crew.id)
          .order('created_at', { ascending: false })
        if (f.error) throw f.error
        flags = ((f.data ?? []) as FlagRow[]).map(mapFlag)
      }
      const puuids = [...new Set(flags.map((x) => x.puuid))]
      let players: PlayerRecord[] = []
      if (puuids.length) {
        const p = await this.deps.supabase.from('players').select('*').in('puuid', puuids)
        if (p.error) throw p.error
        players = ((p.data ?? []) as PlayerRow[]).map(mapPlayer)
      }
      this.cache = { crew, flags, players, lastSyncedAt: new Date().toISOString() }
      this.saveCache()
      this.setOnline(true)
      this.deps.onFlagsChanged(flags)
      this.subscribe(crew)
      await this.flushPending()
    } catch (e) {
      console.warn('[store] refresh failed', e)
      this.setOnline(false)
    }
  }

  async crew(): Promise<{ crew: Crew; members: CrewMember[] } | null> {
    if (!this.cache.crew) await this.refresh()
    const crew = this.cache.crew
    if (!crew) return null
    const m = await this.deps.supabase
      .from('crew_members')
      .select('user_id, discord_name')
      .eq('crew_id', crew.id)
    const members = ((m.data ?? []) as Array<{ user_id: string; discord_name: string }>).map(
      (r) => ({ userId: r.user_id, discordName: r.discord_name })
    )
    return { crew, members }
  }

  async createCrew(name: string): Promise<Crew> {
    const { data, error } = await this.deps.supabase.rpc('create_crew', { p_name: name })
    if (error) throw error
    await this.refresh()
    return mapCrew(data as CrewRow)
  }

  async joinCrew(code: string): Promise<Crew> {
    const { data, error } = await this.deps.supabase.rpc('join_crew', { p_code: code })
    if (error) throw error
    await this.refresh()
    return mapCrew(data as CrewRow)
  }

  async addFlag(input: { puuid: string; note: string }, player?: PlayerRecord): Promise<Flag> {
    if (!this.cache.crew) throw new Error('join or create a crew first')
    if (player) await this.deps.supabase.from('players').upsert(toPlayerRow(player))
    const { data, error } = await this.deps.supabase
      .from('flags')
      .insert({ crew_id: this.cache.crew.id, puuid: input.puuid, note: input.note })
      .select('*')
      .single()
    if (error) throw error
    const flag = mapFlag(data as FlagRow)
    this.cache.flags = [flag, ...this.cache.flags.filter((f) => f.id !== flag.id)]
    if (player && !this.cache.players.some((p) => p.puuid === player.puuid)) {
      this.cache.players.push(player)
    }
    this.saveCache()
    this.deps.onFlagsChanged(this.cache.flags)
    return flag
  }

  async deleteFlag(id: string): Promise<void> {
    const { error } = await this.deps.supabase.from('flags').delete().eq('id', id)
    if (error) throw error
    this.cache.flags = this.cache.flags.filter((f) => f.id !== id)
    this.saveCache()
    this.deps.onFlagsChanged(this.cache.flags)
  }

  async upsertPlayers(players: PlayerRecord[]): Promise<void> {
    if (!players.length) return
    // Cache first: the list renders names from here, so a flag added right after a lookup
    // must not have to wait for the next refresh (it used to show the raw PUUID).
    const byPuuid = new Map(this.cache.players.map((p) => [p.puuid, p]))
    for (const p of players) byPuuid.set(p.puuid, p)
    this.cache.players = [...byPuuid.values()]
    this.saveCache()
    try {
      const { error } = await this.deps.supabase
        .from('players')
        .upsert(players.map(toPlayerRow), { onConflict: 'puuid' })
      if (error) throw error
      this.setOnline(true)
    } catch {
      this.pending.push({ kind: 'upsertPlayers', players })
      this.setOnline(false)
    }
  }

  private async flushPending(): Promise<void> {
    const items = this.pending
    this.pending = []
    for (const item of items) await this.upsertPlayers(item.players)
    this.deps.onStatus(this.status())
  }

  private subscribe(crew: Crew | null): void {
    this.stop()
    if (!crew) return
    this.channel = this.deps.supabase
      .channel(`flags:${crew.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'flags', filter: `crew_id=eq.${crew.id}` },
        () => {
          void this.refresh()
        }
      )
      .subscribe()
  }

  private setOnline(v: boolean): void {
    this.online = v
    this.deps.onStatus(this.status())
  }

  private loadCache(): void {
    try {
      if (existsSync(this.deps.cacheFile)) {
        this.cache = { ...this.cache, ...JSON.parse(readFileSync(this.deps.cacheFile, 'utf8')) }
      }
    } catch {
      /* corrupt cache: start empty */
    }
  }

  private saveCache(): void {
    mkdirSync(dirname(this.deps.cacheFile), { recursive: true })
    writeFileSync(this.deps.cacheFile, JSON.stringify(this.cache))
  }
}
