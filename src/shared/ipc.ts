import type {
  AuthUser,
  Crew,
  CrewMember,
  CurrentGame,
  Flag,
  Hit,
  LcuState,
  PlayerRecord,
  RiotId,
  SyncStatus
} from './types'

/** main → renderer pushes */
export interface PushEvents {
  'game:update': { game: CurrentGame | null; hits: Hit[] }
  'lcu:state': LcuState
  'flags:changed': Flag[]
  'auth:changed': AuthUser | null
  'sync:status': SyncStatus
}

/** renderer → main request/response */
export interface Invoke {
  'game:get': { args: []; result: { game: CurrentGame | null; hits: Hit[] } }
  'lcu:getState': { args: []; result: LcuState }
  'lcu:debugLookup': { args: [RiotId]; result: string }
  'flags:list': { args: []; result: Flag[] }
  'flags:add': { args: [{ puuid: string; note: string }]; result: Flag }
  'flags:delete': { args: [id: string]; result: void }
  'players:list': { args: []; result: PlayerRecord[] }
  'players:lookup': { args: [RiotId]; result: PlayerRecord | null }
  'auth:signIn': { args: []; result: AuthUser }
  'auth:signOut': { args: []; result: void }
  'auth:get': { args: []; result: AuthUser | null }
  'crew:get': { args: []; result: { crew: Crew; members: CrewMember[] } | null }
  'crew:create': { args: [name: string]; result: Crew }
  'crew:join': { args: [inviteCode: string]; result: Crew }
  'sync:status': { args: []; result: SyncStatus }
  'settings:get': { args: []; result: { lockfilePath: string | null } }
  'settings:setLockfilePath': { args: [path: string | null]; result: void }
}

export type InvokeChannel = keyof Invoke
export type PushChannel = keyof PushEvents
