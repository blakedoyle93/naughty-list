export type GameflowPhase =
  | 'None'
  | 'Lobby'
  | 'Matchmaking'
  | 'ReadyCheck'
  | 'ChampSelect'
  | 'GameStart'
  | 'InProgress'
  | 'WaitingForStats'
  | 'PreEndOfGame'
  | 'EndOfGame'
  | 'Reconnect'
  | (string & {})

export type Team = 'ally' | 'enemy'

export interface Player {
  puuid: string | null
  gameName: string
  tagLine: string
  team: Team
  championName?: string
  summonerId?: number
}

export interface CurrentGame {
  gameId: string
  phase: GameflowPhase
  players: Player[]
  /** true while Riot hides enemy identities (champ select) */
  enemiesHidden: boolean
}

export interface Flag {
  id: string
  crewId: string
  puuid: string
  note: string
  createdBy: string
  createdByName: string
  createdAt: string
}

export interface PlayerRecord {
  puuid: string
  gameName: string
  tagLine: string
  region: string | null
  lastSeenAt: string
}

/** One of your past games, from the client's own match history. */
export interface PastGame {
  gameId: string
  /** ISO timestamp of when the game ended, or '' when the client doesn't say. */
  playedAt: string
  queue: string
  win: boolean | null
  players: Player[]
}

export interface Hit {
  player: Player
  flags: Flag[]
}

export type LcuState = 'disconnected' | 'connected'

export interface Crew {
  id: string
  name: string
  inviteCode: string
}

export interface CrewMember {
  userId: string
  discordName: string
}

export interface AuthUser {
  id: string
  discordName: string
}

export interface SyncStatus {
  online: boolean
  pendingWrites: number
  lastSyncedAt: string | null
}

export interface UpdateStatus {
  version: string
  /** 'idle' before the first check. 'ready' means a downloaded update is waiting for a restart. */
  state: 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'ready' | 'error'
  latest: string | null
  /** true when this build can install updates itself (Windows). */
  canSelfUpdate: boolean
  message: string | null
}

export interface RiotId {
  gameName: string
  tagLine: string
}
