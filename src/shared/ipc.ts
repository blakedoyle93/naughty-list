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
  SyncStatus,
  PastGame,
  UpdateStatus
} from './types'

/** main → renderer pushes */
export interface PushEvents {
  'game:update': { game: CurrentGame | null; hits: Hit[] }
  'lcu:state': LcuState
  'flags:changed': Flag[]
  'auth:changed': AuthUser | null
  'sync:status': SyncStatus
  'update:status': UpdateStatus
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
  /** Name (tag optional) → player, via the client, your match history, then op.gg. */
  'players:resolve': {
    args: [{ gameName: string; tagLine: string }]
    result: { source: 'given' | 'history' | 'opgg'; record: PlayerRecord } | null
  }
  'players:candidates': { args: [string]; result: RiotId[] }
  'history:list': { args: [number | undefined]; result: PastGame[] }
  'settings:setRegion': { args: [string]; result: void }
  'settings:setOverlay': { args: [boolean]; result: void }
  'log:tail': { args: []; result: string[] }
  'log:open': { args: []; result: void }
  'debug:testAlert': { args: []; result: void }
  'update:get': { args: []; result: UpdateStatus }
  'update:check': { args: []; result: UpdateStatus }
  'update:install': { args: []; result: void }
  'update:openReleases': { args: []; result: void }
  'auth:signIn': { args: []; result: AuthUser }
  'auth:signOut': { args: []; result: void }
  'auth:get': { args: []; result: AuthUser | null }
  'crew:get': { args: []; result: { crew: Crew; members: CrewMember[] } | null }
  'crew:create': { args: [name: string]; result: Crew }
  'crew:join': { args: [inviteCode: string]; result: Crew }
  'sync:status': { args: []; result: SyncStatus }
  'crew:setWebhook': { args: [url: string | null]; result: void }
  'crew:testWebhook': {
    args: []
    result: 'sent' | 'no-webhook' | 'bad-webhook' | 'nothing-to-say' | 'failed'
  }
  'settings:get': {
    args: []
    result: { lockfilePath: string | null; region: string; overlayEnabled: boolean }
  }
  'settings:setLockfilePath': { args: [path: string | null]; result: void }
}

export type InvokeChannel = keyof Invoke
export type PushChannel = keyof PushEvents
