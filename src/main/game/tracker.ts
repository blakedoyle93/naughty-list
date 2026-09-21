import type { CurrentGame, Flag, GameflowPhase, Hit, Player } from '@shared/types'
import type { LcuApi } from '@main/lcu/endpoints'
import { AlertDeduper, matchPlayers } from '@main/match/matcher'

export interface TrackerDeps {
  lcu: LcuApi
  pollLive: (signal: AbortSignal) => Promise<Player[] | null>
  getFlags: () => Flag[]
  onUpdate: (game: CurrentGame | null, hits: Hit[]) => void
  onAlert: (hit: Hit) => void
  /** players with a puuid, for upserting the shared players table */
  onPlayersSeen: (players: Player[]) => void
}

const CLEARING_PHASES = new Set<GameflowPhase>(['None', 'Lobby', 'Matchmaking', 'ReadyCheck'])

export class GameTracker {
  private game: CurrentGame | null = null
  private hits: Hit[] = []
  private readonly deduper = new AlertDeduper()
  private liveAbort: AbortController | null = null

  constructor(private readonly deps: TrackerDeps) {}

  current(): { game: CurrentGame | null; hits: Hit[] } {
    return { game: this.game, hits: this.hits }
  }

  /** Idempotent; call on every LCU phase event and once on connect. */
  async handlePhase(phase: GameflowPhase): Promise<void> {
    if (phase !== 'InProgress') this.abortLive()

    if (CLEARING_PHASES.has(phase)) {
      this.setGame(null)
      return
    }

    if (phase === 'ChampSelect') {
      const players = await this.deps.lcu.getChampSelectPlayers()
      const gameId = await this.gameId('champselect')
      this.setGame({ gameId, phase, players, enemiesHidden: true })
      return
    }

    if (phase === 'InProgress') {
      const gameId = await this.gameId(this.game?.gameId ?? 'inprogress')
      this.setGame({
        gameId,
        phase,
        players: this.game?.players ?? [],
        enemiesHidden: this.game?.enemiesHidden ?? true
      })
      this.abortLive()
      const ac = new AbortController()
      this.liveAbort = ac
      const live = await this.deps.pollLive(ac.signal)
      if (ac.signal.aborted || !live) return
      const resolved = await Promise.all(
        live.map(async (p) => {
          if (p.puuid || !p.gameName) return p
          const rec = await this.deps.lcu.lookupAlias({ gameName: p.gameName, tagLine: p.tagLine })
          return rec ? { ...p, puuid: rec.puuid } : p
        })
      )
      this.setGame({ gameId, phase, players: resolved, enemiesHidden: false })
      return
    }

    if (phase === 'EndOfGame') {
      const { gameId, players } = await this.deps.lcu.getEogPlayers()
      this.setGame({
        gameId: gameId || this.game?.gameId || 'eog',
        phase,
        players,
        enemiesHidden: false
      })
      return
    }

    // GameStart, WaitingForStats, PreEndOfGame, Reconnect: keep players, update phase
    if (this.game) this.setGame({ ...this.game, phase })
  }

  /** Re-match the current game after the flag list changes. */
  refreshHits(): void {
    if (this.game) this.setGame(this.game)
  }

  dispose(): void {
    this.abortLive()
  }

  private async gameId(fallback: string): Promise<string> {
    const s = await this.deps.lcu.getGameflowSession()
    return s?.gameId ?? fallback
  }

  private abortLive(): void {
    this.liveAbort?.abort()
    this.liveAbort = null
  }

  private setGame(game: CurrentGame | null): void {
    this.game = game
    this.hits = game ? matchPlayers(game.players, this.deps.getFlags()) : []
    this.deps.onUpdate(this.game, this.hits)
    if (!game) return
    const seen = game.players.filter((p) => p.puuid && p.gameName)
    if (seen.length) this.deps.onPlayersSeen(seen)
    for (const hit of this.deduper.take(game.gameId, this.hits)) this.deps.onAlert(hit)
  }
}
