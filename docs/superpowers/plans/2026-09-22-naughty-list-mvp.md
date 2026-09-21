# Naughty List MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Windows + macOS Electron app that lets a Discord-authenticated crew keep a shared list of flagged League players and get an OS notification when one is in the current game.

**Architecture:** Electron main process talks to the League client (LCU API via lockfile creds + WebSocket) and the in-game Live Client Data API, runs a gameflow state machine, and matches players against a locally cached copy of the crew's flags. Supabase provides Discord OAuth (PKCE + loopback redirect), Postgres with RLS per crew, and realtime flag sync. React renderer talks to main over a typed IPC surface only.

**Tech Stack:** Electron (via `electron-vite` `react-ts` template), React 19, TypeScript, Tailwind v4, Zod, Vitest, `@supabase/supabase-js` v2, `electron-builder`, `electron-updater`, Supabase CLI + pgTAP.

**Spec:** `docs/superpowers/specs/2026-09-22-naughty-list-design.md`

## Global Constraints

- Platforms: Windows 10/11 and macOS 13+. Every path/OS branch must handle both.
- Only local Riot APIs: LCU at `https://127.0.0.1:<lockfile port>` with basic auth `riot:<password>`, Live Client Data at `https://127.0.0.1:2999`. Never anything else touching game or client processes.
- `rejectUnauthorized: false` is allowed **only** for hosts `127.0.0.1`. Never globally.
- Identity key is `puuid`. Never match on names.
- Renderer: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. All main-process access through `src/preload/index.ts`.
- All external JSON validated with Zod `.passthrough()` schemas; validation failure logs and degrades, never throws to the UI.
- Supabase anon key + URL ship in the app. Service role key never appears in this repo.
- Default lockfile paths: macOS `/Applications/League of Legends.app/Contents/LoL/lockfile`, Windows `C:\Riot Games\League of Legends\lockfile`. User override stored in settings.
- Live Client polling: every 1000 ms, give up after 60 000 ms.
- Lockfile retry while absent: every 5000 ms.
- OAuth loopback: `http://localhost:53682/callback`.
- Commit after every task with a conventional-commit message ending in `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## File Structure

```
naughty-list/
├── electron.vite.config.ts
├── electron-builder.yml
├── vitest.config.ts
├── package.json
├── .github/workflows/release.yml
├── supabase/
│   ├── config.toml
│   ├── migrations/20260922000000_init.sql
│   └── tests/rls.test.sql
├── test/fixtures/            # recorded/representative Riot JSON
│   ├── lockfile.txt
│   ├── champ-select-session.json
│   ├── gameflow-session.json
│   ├── live-playerlist.json
│   └── eog-stats-block.json
└── src/
    ├── shared/
    │   ├── types.ts          # domain types used by main + renderer
    │   └── ipc.ts            # channel names + payload types
    ├── main/
    │   ├── index.ts          # app bootstrap, wiring only
    │   ├── settings.ts       # JSON settings in userData
    │   ├── lcu/
    │   │   ├── lockfile.ts   # find + parse lockfile
    │   │   ├── client.ts     # HTTPS + WS client
    │   │   ├── schemas.ts    # zod schemas for LCU payloads
    │   │   └── endpoints.ts  # typed endpoint functions
    │   ├── live/
    │   │   ├── schemas.ts
    │   │   └── client.ts     # playerlist poller
    │   ├── game/
    │   │   └── tracker.ts    # gameflow state machine → CurrentGame
    │   ├── match/
    │   │   └── matcher.ts    # pure matching + dedupe
    │   ├── sync/
    │   │   ├── supabase.ts   # client factory w/ file storage
    │   │   ├── auth.ts       # PKCE loopback sign-in
    │   │   └── store.ts      # flags cache, realtime, write queue
    │   ├── notify.ts
    │   ├── tray.ts
    │   └── ipc.ts            # ipcMain handlers
    ├── preload/index.ts
    └── renderer/
        ├── index.html
        └── src/
            ├── main.tsx
            ├── App.tsx
            ├── api.ts        # typed window.naughty wrapper
            ├── hooks/useGame.ts
            ├── hooks/useFlags.ts
            ├── hooks/useAuth.ts
            ├── tabs/CurrentGame.tsx
            ├── tabs/NaughtyList.tsx
            └── tabs/Crew.tsx
```

---

### Task 1: Scaffold project, test runner, Tailwind

**Files:**
- Create: everything from `npm create @quick-start/electron`, then `vitest.config.ts`, `src/renderer/src/index.css`
- Modify: `package.json`, `electron.vite.config.ts`, `tsconfig.node.json`, `tsconfig.web.json`
- Test: `src/shared/smoke.test.ts`

**Interfaces:**
- Produces: `npm run dev`, `npm test`, `npm run build`, `npm run typecheck` all working. Path alias `@shared/*` → `src/shared/*` in both main and renderer tsconfigs.

- [ ] **Step 1: Scaffold into the existing repo**

The repo already exists with `docs/`. Scaffold into a temp dir and move contents in.

```bash
cd /Users/blakedoyle/repos
npm create @quick-start/electron@latest naughty-list-tmp -- --template react-ts
rsync -a --exclude .git naughty-list-tmp/ naughty-list/
rm -rf naughty-list-tmp
cd naughty-list
npm install
```

- [ ] **Step 2: Add dependencies**

```bash
npm i zod @supabase/supabase-js electron-updater
npm i -D vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event tailwindcss @tailwindcss/vite
```

- [ ] **Step 3: Configure Vitest**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@main': resolve(__dirname, 'src/main'),
      '@renderer': resolve(__dirname, 'src/renderer/src')
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./test/setup.ts']
  }
})
```

Create `test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

Renderer tests opt into jsdom with a file-level comment `// @vitest-environment jsdom`.

- [ ] **Step 4: Add path aliases and Tailwind to electron-vite config**

Replace `electron.vite.config.ts`:

```ts
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': resolve('src/shared'), '@main': resolve('src/main') } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  renderer: {
    resolve: {
      alias: { '@renderer': resolve('src/renderer/src'), '@shared': resolve('src/shared') }
    },
    plugins: [react(), tailwindcss()]
  }
})
```

Add to `tsconfig.node.json` `compilerOptions.paths`: `"@shared/*": ["src/shared/*"], "@main/*": ["src/main/*"]` and include `src/shared/**/*`. Add to `tsconfig.web.json` paths: `"@renderer/*": ["src/renderer/src/*"], "@shared/*": ["src/shared/*"]` and include `src/shared/**/*`.

Replace the template CSS files in `src/renderer/src/assets/` with a single `src/renderer/src/index.css` containing `@import "tailwindcss";` and import it from `main.tsx`. Delete template `assets/*.svg`, `components/Versions.tsx`.

- [ ] **Step 5: Add scripts**

In `package.json` `scripts` add `"test": "vitest run"`, `"test:watch": "vitest"`. Keep the template's `dev`, `build`, `typecheck`, `build:mac`, `build:win`.

- [ ] **Step 6: Write smoke test**

`src/shared/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('toolchain', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 7: Verify**

Run: `npm test` → 1 passed. Run: `npm run typecheck` → no errors. Run: `npm run build` → `out/` produced.

- [ ] **Step 8: Add .gitignore entries and commit**

Ensure `.gitignore` has `node_modules`, `out`, `dist`, `.env`, `supabase/.temp`.

```bash
git add -A
git commit -m "chore: scaffold electron-vite react-ts app with vitest and tailwind

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Shared domain types and IPC contract

**Files:**
- Create: `src/shared/types.ts`, `src/shared/ipc.ts`
- Test: `src/shared/types.test.ts`

**Interfaces:**
- Produces (every later task imports these exactly):

`src/shared/types.ts`:

```ts
export type GameflowPhase =
  | 'None' | 'Lobby' | 'Matchmaking' | 'ReadyCheck' | 'ChampSelect' | 'GameStart'
  | 'InProgress' | 'WaitingForStats' | 'PreEndOfGame' | 'EndOfGame' | 'Reconnect'
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

export interface RiotId {
  gameName: string
  tagLine: string
}
```

`src/shared/ipc.ts`:

```ts
import type {
  AuthUser, Crew, CrewMember, CurrentGame, Flag, Hit, LcuState, PlayerRecord, RiotId, SyncStatus
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
```

- [ ] **Step 1: Write a compile-time test**

`src/shared/types.test.ts`:

```ts
import { describe, it, expectTypeOf } from 'vitest'
import type { Invoke, PushEvents } from './ipc'
import type { CurrentGame, Hit } from './types'

describe('ipc contract', () => {
  it('game:update payload matches game:get result', () => {
    expectTypeOf<PushEvents['game:update']>().toEqualTypeOf<Invoke['game:get']['result']>()
    expectTypeOf<PushEvents['game:update']['game']>().toEqualTypeOf<CurrentGame | null>()
    expectTypeOf<PushEvents['game:update']['hits']>().toEqualTypeOf<Hit[]>()
  })
})
```

- [ ] **Step 2: Run to see it fail** — `npm test` → fails: cannot resolve `./ipc`.
- [ ] **Step 3: Create the two files** with the exact contents above.
- [ ] **Step 4: Run** — `npm test` and `npm run typecheck` → pass.
- [ ] **Step 5: Commit**

```bash
git add src/shared
git commit -m "feat: add shared domain types and ipc contract

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Lockfile discovery and parsing

**Files:**
- Create: `src/main/lcu/lockfile.ts`, `test/fixtures/lockfile.txt`
- Test: `src/main/lcu/lockfile.test.ts`

**Interfaces:**
- Produces:

```ts
export interface LockfileInfo { processName: string; pid: number; port: number; password: string; protocol: 'https' | 'http' }
export function parseLockfile(contents: string): LockfileInfo   // throws on malformed
export function defaultLockfilePaths(platform: NodeJS.Platform): string[]
export function readLockfile(opts: { override: string | null; platform?: NodeJS.Platform; readFile?: (p: string) => string }): LockfileInfo | null
```

- [ ] **Step 1: Fixture**

`test/fixtures/lockfile.txt` (real format, no trailing newline):

```
LeagueClientUx:12345:54321:AbCdEfGhIjKlMnOpQrStUv:https
```

- [ ] **Step 2: Failing tests**

`src/main/lcu/lockfile.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { parseLockfile, defaultLockfilePaths, readLockfile } from './lockfile'

const fixture = readFileSync('test/fixtures/lockfile.txt', 'utf8')

describe('parseLockfile', () => {
  it('parses the five colon-separated fields', () => {
    expect(parseLockfile(fixture)).toEqual({
      processName: 'LeagueClientUx', pid: 12345, port: 54321,
      password: 'AbCdEfGhIjKlMnOpQrStUv', protocol: 'https'
    })
  })
  it('throws on malformed content', () => {
    expect(() => parseLockfile('garbage')).toThrow(/malformed lockfile/)
  })
})

describe('defaultLockfilePaths', () => {
  it('returns mac path on darwin', () => {
    expect(defaultLockfilePaths('darwin')).toEqual([
      '/Applications/League of Legends.app/Contents/LoL/lockfile'
    ])
  })
  it('returns windows path on win32', () => {
    expect(defaultLockfilePaths('win32')).toEqual(['C:\\Riot Games\\League of Legends\\lockfile'])
  })
})

describe('readLockfile', () => {
  it('prefers the override path', () => {
    const readFile = (p: string): string => {
      if (p === '/custom/lockfile') return fixture
      throw new Error('ENOENT')
    }
    expect(readLockfile({ override: '/custom/lockfile', platform: 'darwin', readFile })?.port).toBe(54321)
  })
  it('falls back to defaults and returns null when nothing exists', () => {
    const readFile = (): string => { throw new Error('ENOENT') }
    expect(readLockfile({ override: null, platform: 'darwin', readFile })).toBeNull()
  })
})
```

- [ ] **Step 3: Run** — `npm test -- lockfile` → fails, module missing.
- [ ] **Step 4: Implement**

`src/main/lcu/lockfile.ts`:

```ts
import { readFileSync } from 'fs'

export interface LockfileInfo {
  processName: string
  pid: number
  port: number
  password: string
  protocol: 'https' | 'http'
}

export function parseLockfile(contents: string): LockfileInfo {
  const parts = contents.trim().split(':')
  if (parts.length < 5) throw new Error('malformed lockfile')
  const [processName, pid, port, password, protocol] = parts
  const pidN = Number(pid)
  const portN = Number(port)
  if (!Number.isInteger(pidN) || !Number.isInteger(portN) || !password) {
    throw new Error('malformed lockfile')
  }
  return { processName, pid: pidN, port: portN, password, protocol: protocol === 'http' ? 'http' : 'https' }
}

export function defaultLockfilePaths(platform: NodeJS.Platform): string[] {
  if (platform === 'darwin') return ['/Applications/League of Legends.app/Contents/LoL/lockfile']
  if (platform === 'win32') return ['C:\\Riot Games\\League of Legends\\lockfile']
  return []
}

export function readLockfile(opts: {
  override: string | null
  platform?: NodeJS.Platform
  readFile?: (p: string) => string
}): LockfileInfo | null {
  const readFile = opts.readFile ?? ((p: string) => readFileSync(p, 'utf8'))
  const candidates = opts.override ? [opts.override] : defaultLockfilePaths(opts.platform ?? process.platform)
  for (const p of candidates) {
    try {
      return parseLockfile(readFile(p))
    } catch {
      /* try next */
    }
  }
  return null
}
```

- [ ] **Step 5: Run** — `npm test -- lockfile` → 6 passed.
- [ ] **Step 6: Commit**

```bash
git add src/main/lcu/lockfile.ts src/main/lcu/lockfile.test.ts test/fixtures/lockfile.txt
git commit -m "feat(lcu): locate and parse league client lockfile

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: LCU HTTP + WebSocket client

**Files:**
- Create: `src/main/lcu/client.ts`
- Test: `src/main/lcu/client.test.ts`

**Interfaces:**
- Consumes: `LockfileInfo` from Task 3.
- Produces:

```ts
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ status: number; text(): Promise<string> }>
export interface LcuEvent { uri: string; eventType: 'Create' | 'Update' | 'Delete'; data: unknown }
export function parseLcuWsMessage(raw: string): LcuEvent | null
export class LcuClient {
  constructor(info: LockfileInfo, deps?: { fetch?: FetchLike; WebSocketImpl?: typeof WebSocket })
  get(path: string): Promise<unknown>                // JSON; throws LcuHttpError on non-2xx
  subscribe(eventName: string, cb: (e: LcuEvent) => void): () => void  // opens WS lazily
  close(): void
}
export class LcuHttpError extends Error { status: number }
```

Auth header is `Basic base64("riot:" + password)`. WS URL `wss://127.0.0.1:<port>/`, subscribe by sending `[5, eventName]`, messages arrive as `[8, eventName, {uri,eventType,data}]`.

- [ ] **Step 1: Failing tests**

`src/main/lcu/client.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { LcuClient, LcuHttpError, parseLcuWsMessage } from './client'
import type { LockfileInfo } from './lockfile'

const info: LockfileInfo = { processName: 'x', pid: 1, port: 5555, password: 'pw', protocol: 'https' }

describe('LcuClient.get', () => {
  it('calls the right url with basic auth and parses json', async () => {
    const fetch = vi.fn().mockResolvedValue({ status: 200, text: async () => '{"phase":"Lobby"}' })
    const c = new LcuClient(info, { fetch })
    await expect(c.get('/lol-gameflow/v1/gameflow-phase')).resolves.toEqual({ phase: 'Lobby' })
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://127.0.0.1:5555/lol-gameflow/v1/gameflow-phase')
    expect(init.headers.Authorization).toBe('Basic ' + Buffer.from('riot:pw').toString('base64'))
  })
  it('throws LcuHttpError on non-2xx', async () => {
    const fetch = vi.fn().mockResolvedValue({ status: 404, text: async () => '{"message":"nope"}' })
    const c = new LcuClient(info, { fetch })
    await expect(c.get('/x')).rejects.toBeInstanceOf(LcuHttpError)
  })
})

describe('parseLcuWsMessage', () => {
  it('parses opcode 8 event frames', () => {
    const raw = JSON.stringify([8, 'OnJsonApiEvent_lol-gameflow_v1_gameflow-phase',
      { uri: '/lol-gameflow/v1/gameflow-phase', eventType: 'Update', data: 'ChampSelect' }])
    expect(parseLcuWsMessage(raw)).toEqual({
      uri: '/lol-gameflow/v1/gameflow-phase', eventType: 'Update', data: 'ChampSelect'
    })
  })
  it('ignores empty keepalive frames and other opcodes', () => {
    expect(parseLcuWsMessage('')).toBeNull()
    expect(parseLcuWsMessage('[6,"x"]')).toBeNull()
    expect(parseLcuWsMessage('not json')).toBeNull()
  })
})
```

- [ ] **Step 2: Run** — fails.
- [ ] **Step 3: Implement**

`src/main/lcu/client.ts`:

```ts
import { Agent } from 'https'
import type { LockfileInfo } from './lockfile'

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string }
) => Promise<{ status: number; text(): Promise<string> }>

export interface LcuEvent {
  uri: string
  eventType: 'Create' | 'Update' | 'Delete'
  data: unknown
}

export class LcuHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export function parseLcuWsMessage(raw: string): LcuEvent | null {
  if (!raw) return null
  try {
    const frame = JSON.parse(raw)
    if (!Array.isArray(frame) || frame[0] !== 8) return null
    const payload = frame[2]
    if (!payload || typeof payload.uri !== 'string') return null
    return { uri: payload.uri, eventType: payload.eventType, data: payload.data }
  } catch {
    return null
  }
}

/** Node's fetch does not accept an https.Agent; build one with undici-style dispatcher fallback. */
function defaultFetch(): FetchLike {
  // Electron main has Node fetch (undici). Self-signed cert on 127.0.0.1 needs a dispatcher.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Agent: UndiciAgent } = require('undici') as typeof import('undici')
  const dispatcher = new UndiciAgent({ connect: { rejectUnauthorized: false } })
  return (url, init) => fetch(url, { ...init, dispatcher } as RequestInit)
}

export const insecureLocalAgent = new Agent({ rejectUnauthorized: false })

export class LcuClient {
  private readonly base: string
  private readonly auth: string
  private readonly fetchImpl: FetchLike
  private readonly WS: typeof WebSocket
  private ws: WebSocket | null = null
  private readonly listeners = new Map<string, Set<(e: LcuEvent) => void>>()

  constructor(private readonly info: LockfileInfo, deps: { fetch?: FetchLike; WebSocketImpl?: typeof WebSocket } = {}) {
    this.base = `${info.protocol}://127.0.0.1:${info.port}`
    this.auth = 'Basic ' + Buffer.from(`riot:${info.password}`).toString('base64')
    this.fetchImpl = deps.fetch ?? defaultFetch()
    this.WS = deps.WebSocketImpl ?? WebSocket
  }

  async get(path: string): Promise<unknown> {
    const res = await this.fetchImpl(this.base + path, {
      method: 'GET',
      headers: { Authorization: this.auth, Accept: 'application/json' }
    })
    const text = await res.text()
    if (res.status < 200 || res.status >= 300) throw new LcuHttpError(res.status, text)
    return text ? JSON.parse(text) : null
  }

  subscribe(eventName: string, cb: (e: LcuEvent) => void): () => void {
    if (!this.listeners.has(eventName)) this.listeners.set(eventName, new Set())
    this.listeners.get(eventName)!.add(cb)
    this.ensureSocket(eventName)
    return () => this.listeners.get(eventName)?.delete(cb)
  }

  close(): void {
    this.ws?.close()
    this.ws = null
  }

  private ensureSocket(eventName: string): void {
    if (this.ws) {
      if (this.ws.readyState === this.WS.OPEN) this.ws.send(JSON.stringify([5, eventName]))
      return
    }
    const url = `wss://127.0.0.1:${this.info.port}/`
    // Electron's Node WebSocket honours NODE_TLS_REJECT_UNAUTHORIZED only globally; instead use `ws` package
    // via WebSocketImpl injection in index.ts with { rejectUnauthorized: false } bound. See Task 9.
    this.ws = new this.WS(url, ['wamp'], { headers: { Authorization: this.auth } } as never)
    this.ws.addEventListener('open', () => {
      for (const name of this.listeners.keys()) this.ws!.send(JSON.stringify([5, name]))
    })
    this.ws.addEventListener('message', (ev) => {
      const e = parseLcuWsMessage(String((ev as MessageEvent).data))
      if (!e) return
      for (const [name, cbs] of this.listeners) {
        if (matchesEvent(name, e.uri)) cbs.forEach((fn) => fn(e))
      }
    })
    this.ws.addEventListener('close', () => {
      this.ws = null
    })
  }
}

/** 'OnJsonApiEvent_lol-gameflow_v1_gameflow-phase' ↔ '/lol-gameflow/v1/gameflow-phase' */
function matchesEvent(eventName: string, uri: string): boolean {
  if (eventName === 'OnJsonApiEvent') return true
  const expected = '/' + eventName.replace(/^OnJsonApiEvent_/, '').replace(/_/g, '/')
  return uri === expected
}
```

Install `ws` for the main-process socket (Task 9 injects it): `npm i ws && npm i -D @types/ws`. Also `npm i undici`.

- [ ] **Step 4: Run** — `npm test -- client` → 4 passed.
- [ ] **Step 5: Commit**

```bash
git add src/main/lcu/client.ts src/main/lcu/client.test.ts package.json package-lock.json
git commit -m "feat(lcu): https + websocket client with basic auth

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: LCU endpoint schemas and typed functions

**Files:**
- Create: `src/main/lcu/schemas.ts`, `src/main/lcu/endpoints.ts`, `test/fixtures/champ-select-session.json`, `test/fixtures/gameflow-session.json`, `test/fixtures/eog-stats-block.json`
- Test: `src/main/lcu/endpoints.test.ts`

**Interfaces:**
- Consumes: `LcuClient.get` (Task 4), `Player`, `RiotId`, `PlayerRecord` (Task 2).
- Produces:

```ts
export interface LcuApi {
  getGameflowPhase(): Promise<GameflowPhase>
  getGameflowSession(): Promise<{ phase: GameflowPhase; gameId: string } | null>
  getChampSelectPlayers(): Promise<Player[]>          // allies only, puuid when known
  getEogPlayers(): Promise<{ gameId: string; players: Player[] }>
  lookupAlias(id: RiotId): Promise<PlayerRecord | null>
  getSummonerById(summonerId: number): Promise<PlayerRecord | null>
}
export function createLcuApi(client: { get(path: string): Promise<unknown> }): LcuApi
```

Fixtures below are representative of the real payloads. **When you have the client open, replace them with real captures** via `curl -k -u riot:<pw> https://127.0.0.1:<port>/<path>` and keep tests green.

- [ ] **Step 1: Fixtures**

`test/fixtures/champ-select-session.json`:

```json
{
  "gameId": 7001234567,
  "localPlayerCellId": 2,
  "myTeam": [
    { "cellId": 0, "championId": 122, "summonerId": 111, "puuid": "puuid-ally-0", "nameVisibilityType": "VISIBLE", "team": 1 },
    { "cellId": 1, "championId": 0, "summonerId": 0, "puuid": "", "nameVisibilityType": "HIDDEN", "team": 1 },
    { "cellId": 2, "championId": 64, "summonerId": 333, "puuid": "puuid-me", "nameVisibilityType": "VISIBLE", "team": 1 }
  ],
  "theirTeam": [
    { "cellId": 5, "championId": 0, "summonerId": 0, "puuid": "", "nameVisibilityType": "HIDDEN", "team": 2 }
  ],
  "timer": { "phase": "BAN_PICK" }
}
```

`test/fixtures/gameflow-session.json`:

```json
{ "phase": "InProgress", "gameData": { "gameId": 7001234567, "queue": { "id": 450 } } }
```

`test/fixtures/eog-stats-block.json`:

```json
{
  "gameId": 7001234567,
  "teams": [
    { "isPlayerTeam": true,  "players": [ { "puuid": "puuid-me", "summonerName": "Blake", "riotIdGameName": "Blake", "riotIdTagLine": "NA1", "championId": 64 } ] },
    { "isPlayerTeam": false, "players": [ { "puuid": "puuid-enemy-1", "summonerName": "Darius", "riotIdGameName": "xXDariusMainXx", "riotIdTagLine": "0001", "championId": 122 } ] }
  ]
}
```

- [ ] **Step 2: Failing tests**

`src/main/lcu/endpoints.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { createLcuApi } from './endpoints'

const fx = (n: string): unknown => JSON.parse(readFileSync(`test/fixtures/${n}.json`, 'utf8'))

function clientWith(routes: Record<string, unknown>) {
  return {
    get: vi.fn(async (path: string) => {
      const key = Object.keys(routes).find((r) => path.startsWith(r))
      if (!key) throw new Error('404 ' + path)
      return routes[key]
    })
  }
}

describe('createLcuApi', () => {
  it('getGameflowPhase returns the bare string', async () => {
    const api = createLcuApi(clientWith({ '/lol-gameflow/v1/gameflow-phase': 'ChampSelect' }))
    await expect(api.getGameflowPhase()).resolves.toBe('ChampSelect')
  })

  it('getGameflowSession extracts gameId as string', async () => {
    const api = createLcuApi(clientWith({ '/lol-gameflow/v1/session': fx('gameflow-session') }))
    await expect(api.getGameflowSession()).resolves.toEqual({ phase: 'InProgress', gameId: '7001234567' })
  })

  it('getChampSelectPlayers returns allies, keeps hidden ones with null puuid, excludes self', async () => {
    const api = createLcuApi(clientWith({
      '/lol-champ-select/v1/session': fx('champ-select-session'),
      '/lol-summoner/v1/summoners/111': { puuid: 'puuid-ally-0', gameName: 'Ally', tagLine: 'NA1' }
    }))
    const players = await api.getChampSelectPlayers()
    expect(players).toEqual([
      { puuid: 'puuid-ally-0', gameName: 'Ally', tagLine: 'NA1', team: 'ally', summonerId: 111 },
      { puuid: null, gameName: '', tagLine: '', team: 'ally', summonerId: 0 }
    ])
  })

  it('getEogPlayers flattens both teams with riot ids', async () => {
    const api = createLcuApi(clientWith({ '/lol-end-of-game/v1/eog-stats-block': fx('eog-stats-block') }))
    const { gameId, players } = await api.getEogPlayers()
    expect(gameId).toBe('7001234567')
    expect(players).toEqual([
      { puuid: 'puuid-me', gameName: 'Blake', tagLine: 'NA1', team: 'ally' },
      { puuid: 'puuid-enemy-1', gameName: 'xXDariusMainXx', tagLine: '0001', team: 'enemy' }
    ])
  })

  it('lookupAlias returns a PlayerRecord or null on 404', async () => {
    const ok = createLcuApi(clientWith({
      '/lol-summoner/v1/alias/lookup': { puuid: 'p1', gameName: 'Foo', tagLine: 'BAR' }
    }))
    const rec = await ok.lookupAlias({ gameName: 'Foo', tagLine: 'BAR' })
    expect(rec).toMatchObject({ puuid: 'p1', gameName: 'Foo', tagLine: 'BAR', region: null })
    const missing = createLcuApi(clientWith({}))
    await expect(missing.lookupAlias({ gameName: 'x', tagLine: 'y' })).resolves.toBeNull()
  })

  it('returns [] instead of throwing when champ select payload is malformed', async () => {
    const api = createLcuApi(clientWith({ '/lol-champ-select/v1/session': { nope: true } }))
    await expect(api.getChampSelectPlayers()).resolves.toEqual([])
  })
})
```

- [ ] **Step 3: Run** — fails.
- [ ] **Step 4: Implement schemas**

`src/main/lcu/schemas.ts`:

```ts
import { z } from 'zod'

export const GameflowSessionSchema = z.object({
  phase: z.string(),
  gameData: z.object({ gameId: z.number() }).passthrough()
}).passthrough()

export const ChampSelectCellSchema = z.object({
  cellId: z.number(),
  summonerId: z.number().default(0),
  puuid: z.string().default(''),
  championId: z.number().default(0),
  nameVisibilityType: z.string().optional()
}).passthrough()

export const ChampSelectSessionSchema = z.object({
  gameId: z.number().optional(),
  localPlayerCellId: z.number(),
  myTeam: z.array(ChampSelectCellSchema),
  theirTeam: z.array(ChampSelectCellSchema).default([])
}).passthrough()

export const SummonerSchema = z.object({
  puuid: z.string(),
  gameName: z.string().default(''),
  tagLine: z.string().default('')
}).passthrough()

export const EogPlayerSchema = z.object({
  puuid: z.string(),
  summonerName: z.string().default(''),
  riotIdGameName: z.string().optional(),
  riotIdTagLine: z.string().optional(),
  gameName: z.string().optional(),
  tagLine: z.string().optional(),
  championId: z.number().optional()
}).passthrough()

export const EogStatsBlockSchema = z.object({
  gameId: z.number(),
  teams: z.array(z.object({ isPlayerTeam: z.boolean(), players: z.array(EogPlayerSchema) }).passthrough())
}).passthrough()
```

- [ ] **Step 5: Implement endpoints**

`src/main/lcu/endpoints.ts`:

```ts
import type { GameflowPhase, Player, PlayerRecord, RiotId } from '@shared/types'
import { LcuHttpError } from './client'
import {
  ChampSelectSessionSchema, EogStatsBlockSchema, GameflowSessionSchema, SummonerSchema
} from './schemas'

export interface LcuApi {
  getGameflowPhase(): Promise<GameflowPhase>
  getGameflowSession(): Promise<{ phase: GameflowPhase; gameId: string } | null>
  getChampSelectPlayers(): Promise<Player[]>
  getEogPlayers(): Promise<{ gameId: string; players: Player[] }>
  lookupAlias(id: RiotId): Promise<PlayerRecord | null>
  getSummonerById(summonerId: number): Promise<PlayerRecord | null>
}

type Getter = { get(path: string): Promise<unknown> }

const log = (msg: string, err: unknown): void => console.warn(`[lcu] ${msg}`, err)

function toRecord(s: { puuid: string; gameName: string; tagLine: string }): PlayerRecord {
  return { puuid: s.puuid, gameName: s.gameName, tagLine: s.tagLine, region: null, lastSeenAt: new Date().toISOString() }
}

export function createLcuApi(client: Getter): LcuApi {
  async function getSummonerById(summonerId: number): Promise<PlayerRecord | null> {
    try {
      const parsed = SummonerSchema.safeParse(await client.get(`/lol-summoner/v1/summoners/${summonerId}`))
      return parsed.success ? toRecord(parsed.data) : null
    } catch (e) {
      if (!(e instanceof LcuHttpError)) log('getSummonerById', e)
      return null
    }
  }

  return {
    async getGameflowPhase() {
      const v = await client.get('/lol-gameflow/v1/gameflow-phase')
      return typeof v === 'string' ? v : 'None'
    },

    async getGameflowSession() {
      try {
        const parsed = GameflowSessionSchema.safeParse(await client.get('/lol-gameflow/v1/session'))
        if (!parsed.success) return null
        return { phase: parsed.data.phase, gameId: String(parsed.data.gameData.gameId) }
      } catch {
        return null
      }
    },

    async getChampSelectPlayers() {
      let raw: unknown
      try {
        raw = await client.get('/lol-champ-select/v1/session')
      } catch (e) {
        log('champ select fetch', e)
        return []
      }
      const parsed = ChampSelectSessionSchema.safeParse(raw)
      if (!parsed.success) {
        log('champ select shape', parsed.error.flatten())
        return []
      }
      const allies = parsed.data.myTeam.filter((c) => c.cellId !== parsed.data.localPlayerCellId)
      return Promise.all(
        allies.map(async (c): Promise<Player> => {
          const base: Player = { puuid: null, gameName: '', tagLine: '', team: 'ally', summonerId: c.summonerId }
          if (c.summonerId === 0) return base
          const rec = await getSummonerById(c.summonerId)
          if (!rec) return { ...base, puuid: c.puuid || null }
          return { ...base, puuid: rec.puuid, gameName: rec.gameName, tagLine: rec.tagLine }
        })
      )
    },

    async getEogPlayers() {
      const parsed = EogStatsBlockSchema.safeParse(await client.get('/lol-end-of-game/v1/eog-stats-block'))
      if (!parsed.success) {
        log('eog shape', parsed.error.flatten())
        return { gameId: '', players: [] }
      }
      const players: Player[] = parsed.data.teams.flatMap((t) =>
        t.players.map((p) => ({
          puuid: p.puuid,
          gameName: p.riotIdGameName ?? p.gameName ?? p.summonerName,
          tagLine: p.riotIdTagLine ?? p.tagLine ?? '',
          team: t.isPlayerTeam ? ('ally' as const) : ('enemy' as const)
        }))
      )
      return { gameId: String(parsed.data.gameId), players }
    },

    async lookupAlias(id) {
      try {
        const q = `gameName=${encodeURIComponent(id.gameName)}&tagLine=${encodeURIComponent(id.tagLine)}`
        const parsed = SummonerSchema.safeParse(await client.get(`/lol-summoner/v1/alias/lookup?${q}`))
        return parsed.success ? toRecord(parsed.data) : null
      } catch (e) {
        if (!(e instanceof LcuHttpError)) log('lookupAlias', e)
        return null
      }
    },

    getSummonerById
  }
}
```

- [ ] **Step 6: Run** — `npm test -- endpoints` → 6 passed.
- [ ] **Step 7: Commit**

```bash
git add src/main/lcu test/fixtures
git commit -m "feat(lcu): typed endpoints for gameflow, champ select, eog and alias lookup

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Live Client Data poller

**Files:**
- Create: `src/main/live/schemas.ts`, `src/main/live/client.ts`, `test/fixtures/live-playerlist.json`
- Test: `src/main/live/client.test.ts`

**Interfaces:**
- Consumes: `Player`, `FetchLike` (Task 4 export).
- Produces:

```ts
export function parsePlayerList(raw: unknown, activePlayerRiotId: string): Player[]   // team relative to active player
export function pollPlayerList(deps: { fetch: FetchLike; sleep: (ms: number) => Promise<void>; now: () => number },
                               opts?: { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal }): Promise<Player[] | null>
```

- [ ] **Step 1: Fixture**

`test/fixtures/live-playerlist.json`:

```json
[
  { "championName": "Lee Sin", "riotId": "Blake#NA1", "riotIdGameName": "Blake", "riotIdTagLine": "NA1", "summonerName": "Blake", "team": "ORDER" },
  { "championName": "Lux", "riotId": "Ally#NA1", "riotIdGameName": "Ally", "riotIdTagLine": "NA1", "summonerName": "Ally", "team": "ORDER" },
  { "championName": "Darius", "riotId": "xXDariusMainXx#0001", "riotIdGameName": "xXDariusMainXx", "riotIdTagLine": "0001", "summonerName": "xXDariusMainXx", "team": "CHAOS" }
]
```

- [ ] **Step 2: Failing tests**

`src/main/live/client.test.ts`:

```ts
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
      { puuid: null, gameName: 'xXDariusMainXx', tagLine: '0001', team: 'enemy', championName: 'Darius' }
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
      if (url.endsWith('/activeplayername')) return { status: 200, text: async () => JSON.stringify('Blake#NA1') }
      return { status: 200, text: async () => JSON.stringify(list) }
    })
    const sleep = vi.fn(async () => {})
    let t = 0
    const players = await pollPlayerList({ fetch, sleep, now: () => (t += 1000) }, { intervalMs: 1000, timeoutMs: 60000 })
    expect(players).toHaveLength(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })
  it('gives up after timeoutMs and returns null', async () => {
    const fetch = vi.fn(async () => { throw new Error('ECONNREFUSED') })
    let t = 0
    const players = await pollPlayerList({ fetch, sleep: async () => {}, now: () => (t += 10000) }, { timeoutMs: 60000 })
    expect(players).toBeNull()
    expect(fetch.mock.calls.length).toBeLessThanOrEqual(7)
  })
})
```

- [ ] **Step 3: Run** — fails.
- [ ] **Step 4: Implement**

`src/main/live/schemas.ts`:

```ts
import { z } from 'zod'

export const LivePlayerSchema = z.object({
  championName: z.string().default(''),
  riotIdGameName: z.string().default(''),
  riotIdTagLine: z.string().default(''),
  riotId: z.string().optional(),
  summonerName: z.string().default(''),
  team: z.enum(['ORDER', 'CHAOS'])
}).passthrough()

export const LivePlayerListSchema = z.array(LivePlayerSchema)
```

`src/main/live/client.ts`:

```ts
import type { Player } from '@shared/types'
import type { FetchLike } from '@main/lcu/client'
import { LivePlayerListSchema } from './schemas'

export const LIVE_BASE = 'https://127.0.0.1:2999/liveclientdata'

export function parsePlayerList(raw: unknown, activePlayerRiotId: string): Player[] {
  const parsed = LivePlayerListSchema.safeParse(raw)
  if (!parsed.success) return []
  const me = parsed.data.find((p) => (p.riotId ?? `${p.riotIdGameName}#${p.riotIdTagLine}`) === activePlayerRiotId)
  const allyTeam = me?.team ?? 'ORDER'
  return parsed.data.map((p) => ({
    puuid: null,
    gameName: p.riotIdGameName || p.summonerName,
    tagLine: p.riotIdTagLine,
    team: p.team === allyTeam ? 'ally' : 'enemy',
    championName: p.championName
  }))
}

export async function pollPlayerList(
  deps: { fetch: FetchLike; sleep: (ms: number) => Promise<void>; now: () => number },
  opts: { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<Player[] | null> {
  const intervalMs = opts.intervalMs ?? 1000
  const timeoutMs = opts.timeoutMs ?? 60_000
  const start = deps.now()
  const headers = { Accept: 'application/json' }
  while (deps.now() - start < timeoutMs) {
    if (opts.signal?.aborted) return null
    try {
      const me = await deps.fetch(`${LIVE_BASE}/activeplayername`, { method: 'GET', headers })
      const all = await deps.fetch(`${LIVE_BASE}/playerlist`, { method: 'GET', headers })
      if (me.status === 200 && all.status === 200) {
        const riotId = JSON.parse(await me.text()) as string
        const players = parsePlayerList(JSON.parse(await all.text()), riotId)
        if (players.length > 0) return players
      }
    } catch {
      /* game process not up yet */
    }
    await deps.sleep(intervalMs)
  }
  return null
}
```

- [ ] **Step 5: Run** — `npm test -- live` → 4 passed.
- [ ] **Step 6: Commit**

```bash
git add src/main/live test/fixtures/live-playerlist.json
git commit -m "feat(live): poll live client data playerlist with timeout

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Matcher and alert dedupe

**Files:**
- Create: `src/main/match/matcher.ts`
- Test: `src/main/match/matcher.test.ts`

**Interfaces:**
- Consumes: `Player`, `Flag`, `Hit`.
- Produces:

```ts
export function matchPlayers(players: Player[], flags: Flag[]): Hit[]
export class AlertDeduper {
  /** returns only hits not yet alerted for this gameId; forgets other games */
  take(gameId: string, hits: Hit[]): Hit[]
}
```

- [ ] **Step 1: Failing tests**

`src/main/match/matcher.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { matchPlayers, AlertDeduper } from './matcher'
import type { Flag, Player } from '@shared/types'

const flag = (puuid: string, note: string, id = puuid + note): Flag => ({
  id, crewId: 'c', puuid, note, createdBy: 'u', createdByName: 'Blake', createdAt: '2026-09-22T00:00:00Z'
})
const player = (puuid: string | null, gameName = 'x'): Player => ({ puuid, gameName, tagLine: 'NA1', team: 'enemy' })

describe('matchPlayers', () => {
  it('groups all flags for a matched puuid, newest first', () => {
    const hits = matchPlayers([player('a'), player('b')], [
      flag('a', 'old', '1'), { ...flag('a', 'new', '2'), createdAt: '2026-09-23T00:00:00Z' }, flag('z', 'unrelated')
    ])
    expect(hits).toHaveLength(1)
    expect(hits[0].player.puuid).toBe('a')
    expect(hits[0].flags.map((f) => f.note)).toEqual(['new', 'old'])
  })
  it('ignores players without puuid', () => {
    expect(matchPlayers([player(null)], [flag('a', 'n')])).toEqual([])
  })
})

describe('AlertDeduper', () => {
  it('only returns new hits for the same game', () => {
    const d = new AlertDeduper()
    const h1 = matchPlayers([player('a')], [flag('a', 'n')])
    expect(d.take('g1', h1)).toHaveLength(1)
    expect(d.take('g1', h1)).toHaveLength(0)
    const h2 = matchPlayers([player('a'), player('b')], [flag('a', 'n'), flag('b', 'n')])
    expect(d.take('g1', h2).map((h) => h.player.puuid)).toEqual(['b'])
  })
  it('resets when the game changes', () => {
    const d = new AlertDeduper()
    const h = matchPlayers([player('a')], [flag('a', 'n')])
    d.take('g1', h)
    expect(d.take('g2', h)).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run** — fails.
- [ ] **Step 3: Implement**

`src/main/match/matcher.ts`:

```ts
import type { Flag, Hit, Player } from '@shared/types'

export function matchPlayers(players: Player[], flags: Flag[]): Hit[] {
  const byPuuid = new Map<string, Flag[]>()
  for (const f of flags) {
    const list = byPuuid.get(f.puuid) ?? []
    list.push(f)
    byPuuid.set(f.puuid, list)
  }
  const hits: Hit[] = []
  for (const p of players) {
    if (!p.puuid) continue
    const fs = byPuuid.get(p.puuid)
    if (!fs?.length) continue
    hits.push({ player: p, flags: [...fs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) })
  }
  return hits
}

export class AlertDeduper {
  private gameId: string | null = null
  private seen = new Set<string>()

  take(gameId: string, hits: Hit[]): Hit[] {
    if (gameId !== this.gameId) {
      this.gameId = gameId
      this.seen = new Set()
    }
    const fresh = hits.filter((h) => h.player.puuid && !this.seen.has(h.player.puuid))
    fresh.forEach((h) => this.seen.add(h.player.puuid!))
    return fresh
  }
}
```

- [ ] **Step 4: Run** — 4 passed.
- [ ] **Step 5: Commit**

```bash
git add src/main/match
git commit -m "feat(match): pure player/flag matcher and per-game alert dedupe

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Game tracker state machine

**Files:**
- Create: `src/main/game/tracker.ts`
- Test: `src/main/game/tracker.test.ts`

**Interfaces:**
- Consumes: `LcuApi` (Task 5), `pollPlayerList` signature (Task 6), `matchPlayers`/`AlertDeduper` (Task 7), types.
- Produces:

```ts
export interface TrackerDeps {
  lcu: LcuApi
  pollLive: (signal: AbortSignal) => Promise<Player[] | null>
  getFlags: () => Flag[]
  onUpdate: (game: CurrentGame | null, hits: Hit[]) => void
  onAlert: (hit: Hit) => void
  onPlayersSeen: (players: Player[]) => void   // for upserting players table
}
export class GameTracker {
  constructor(deps: TrackerDeps)
  handlePhase(phase: GameflowPhase): Promise<void>   // idempotent; call on every LCU phase event and once on connect
  refreshHits(): void                                 // re-match current game after flags change
  current(): { game: CurrentGame | null; hits: Hit[] }
  dispose(): void
}
```

Phase rules:
- `ChampSelect` → players = `lcu.getChampSelectPlayers()`, `enemiesHidden: true`, gameId from `getGameflowSession()` or `'champselect'` fallback.
- `InProgress` → abort any previous poll, `pollLive`, resolve each player's puuid via `lcu.lookupAlias`, `enemiesHidden: false`. Players with failed lookup keep `puuid: null`.
- `EndOfGame` → `lcu.getEogPlayers()`, `enemiesHidden: false`.
- Any other phase → if current game exists, keep it but set its `phase`; if phase is `None`/`Lobby`/`Matchmaking` clear it.
- After every players update: hits = `matchPlayers`, `onUpdate(game, hits)`, `onPlayersSeen(players with puuid)`, and `onAlert` for each `deduper.take(gameId, hits)`.

- [ ] **Step 1: Failing tests**

`src/main/game/tracker.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { GameTracker, type TrackerDeps } from './tracker'
import type { Flag, Player } from '@shared/types'
import type { LcuApi } from '@main/lcu/endpoints'

const flagA: Flag = { id: '1', crewId: 'c', puuid: 'A', note: 'ran it down', createdBy: 'u', createdByName: 'B', createdAt: '2026-01-01' }
const ally: Player = { puuid: 'A', gameName: 'Ally', tagLine: 'NA1', team: 'ally', summonerId: 1 }
const enemyLive: Player = { puuid: null, gameName: 'Darius', tagLine: '0001', team: 'enemy', championName: 'Darius' }

function makeDeps(over: Partial<TrackerDeps> = {}): TrackerDeps & { lcu: LcuApi } {
  const lcu: LcuApi = {
    getGameflowPhase: vi.fn(async () => 'None'),
    getGameflowSession: vi.fn(async () => ({ phase: 'ChampSelect', gameId: 'g1' })),
    getChampSelectPlayers: vi.fn(async () => [ally]),
    getEogPlayers: vi.fn(async () => ({ gameId: 'g1', players: [ally, { ...enemyLive, puuid: 'D' }] })),
    lookupAlias: vi.fn(async (id) => (id.gameName === 'Darius' ? { puuid: 'D', gameName: 'Darius', tagLine: '0001', region: null, lastSeenAt: '' } : null)),
    getSummonerById: vi.fn(async () => null)
  }
  return {
    lcu,
    pollLive: vi.fn(async () => [ally, enemyLive]),
    getFlags: () => [flagA],
    onUpdate: vi.fn(),
    onAlert: vi.fn(),
    onPlayersSeen: vi.fn(),
    ...over
  }
}

describe('GameTracker', () => {
  it('ChampSelect: allies matched, enemies hidden, alert fired once', async () => {
    const deps = makeDeps()
    const t = new GameTracker(deps)
    await t.handlePhase('ChampSelect')
    await t.handlePhase('ChampSelect')
    const { game, hits } = t.current()
    expect(game).toMatchObject({ gameId: 'g1', phase: 'ChampSelect', enemiesHidden: true })
    expect(hits[0].player.puuid).toBe('A')
    expect(deps.onAlert).toHaveBeenCalledTimes(1)
  })

  it('InProgress: resolves live players via alias lookup and alerts new hits only', async () => {
    const deps = makeDeps({ getFlags: () => [flagA, { ...flagA, id: '2', puuid: 'D', note: 'inted' }] })
    const t = new GameTracker(deps)
    await t.handlePhase('ChampSelect')
    await t.handlePhase('InProgress')
    const { game, hits } = t.current()
    expect(game?.enemiesHidden).toBe(false)
    expect(game?.players.find((p) => p.gameName === 'Darius')?.puuid).toBe('D')
    expect(hits.map((h) => h.player.puuid).sort()).toEqual(['A', 'D'])
    expect(deps.onAlert).toHaveBeenCalledTimes(2)
    expect(deps.onPlayersSeen).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ puuid: 'D' })]))
  })

  it('EndOfGame: uses eog players', async () => {
    const deps = makeDeps()
    const t = new GameTracker(deps)
    await t.handlePhase('EndOfGame')
    expect(t.current().game?.players).toHaveLength(2)
    expect(deps.lcu.getEogPlayers).toHaveBeenCalled()
  })

  it('Lobby clears the game', async () => {
    const deps = makeDeps()
    const t = new GameTracker(deps)
    await t.handlePhase('ChampSelect')
    await t.handlePhase('Lobby')
    expect(t.current().game).toBeNull()
    expect(deps.onUpdate).toHaveBeenLastCalledWith(null, [])
  })

  it('refreshHits re-matches after flags change', async () => {
    let flags: Flag[] = []
    const deps = makeDeps({ getFlags: () => flags })
    const t = new GameTracker(deps)
    await t.handlePhase('ChampSelect')
    expect(t.current().hits).toHaveLength(0)
    flags = [flagA]
    t.refreshHits()
    expect(t.current().hits).toHaveLength(1)
    expect(deps.onAlert).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run** — fails.
- [ ] **Step 3: Implement**

`src/main/game/tracker.ts`:

```ts
import type { CurrentGame, Flag, GameflowPhase, Hit, Player } from '@shared/types'
import type { LcuApi } from '@main/lcu/endpoints'
import { AlertDeduper, matchPlayers } from '@main/match/matcher'

export interface TrackerDeps {
  lcu: LcuApi
  pollLive: (signal: AbortSignal) => Promise<Player[] | null>
  getFlags: () => Flag[]
  onUpdate: (game: CurrentGame | null, hits: Hit[]) => void
  onAlert: (hit: Hit) => void
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
      this.setGame({ gameId, phase, players: this.game?.players ?? [], enemiesHidden: this.game?.enemiesHidden ?? true })
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
      this.setGame({ gameId: gameId || this.game?.gameId || 'eog', phase, players, enemiesHidden: false })
      return
    }

    // GameStart, WaitingForStats, PreEndOfGame, Reconnect: keep players, update phase
    if (this.game) this.setGame({ ...this.game, phase })
  }

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
```

- [ ] **Step 4: Run** — `npm test -- tracker` → 5 passed.
- [ ] **Step 5: Commit**

```bash
git add src/main/game
git commit -m "feat(game): gameflow tracker producing current game and alerts

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Main process wiring: settings, LCU connection loop, notifications, tray, IPC (local-only, no Supabase yet)

**Files:**
- Create: `src/main/settings.ts`, `src/main/notify.ts`, `src/main/tray.ts`, `src/main/ipc.ts`, `src/main/lcu/connection.ts`
- Modify: `src/main/index.ts` (replace template), `src/preload/index.ts`, `src/preload/index.d.ts`
- Test: `src/main/settings.test.ts`, `src/main/lcu/connection.test.ts`

**Interfaces:**
- Produces:

```ts
// settings.ts
export interface Settings { lockfilePath: string | null }
export class SettingsStore { constructor(filePath: string); get(): Settings; set(patch: Partial<Settings>): void }

// lcu/connection.ts
export class LcuConnection {
  constructor(deps: { readLockfile: () => LockfileInfo | null; makeClient: (i: LockfileInfo) => LcuClient; onConnected: (client: LcuClient) => void; onDisconnected: () => void; retryMs?: number; setTimeoutImpl?: typeof setTimeout })
  start(): void; stop(): void; state(): LcuState
}

// notify.ts
export function notifyHit(hit: Hit): void

// preload exposes window.naughty:
//   invoke<C extends InvokeChannel>(channel: C, ...args: Invoke[C]['args']): Promise<Invoke[C]['result']>
//   on<C extends PushChannel>(channel: C, cb: (payload: PushEvents[C]) => void): () => void
```

- [ ] **Step 1: Settings test + impl**

`src/main/settings.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { SettingsStore } from './settings'

describe('SettingsStore', () => {
  it('defaults, persists, reloads', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'nl-')), 'settings.json')
    const a = new SettingsStore(file)
    expect(a.get()).toEqual({ lockfilePath: null })
    a.set({ lockfilePath: '/x/lockfile' })
    expect(new SettingsStore(file).get().lockfilePath).toBe('/x/lockfile')
  })
})
```

`src/main/settings.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'

export interface Settings {
  lockfilePath: string | null
}

const DEFAULTS: Settings = { lockfilePath: null }

export class SettingsStore {
  private cache: Settings

  constructor(private readonly filePath: string) {
    this.cache = this.load()
  }

  get(): Settings {
    return { ...this.cache }
  }

  set(patch: Partial<Settings>): void {
    this.cache = { ...this.cache, ...patch }
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(this.cache, null, 2))
  }

  private load(): Settings {
    if (!existsSync(this.filePath)) return { ...DEFAULTS }
    try {
      return { ...DEFAULTS, ...JSON.parse(readFileSync(this.filePath, 'utf8')) }
    } catch {
      return { ...DEFAULTS }
    }
  }
}
```

- [ ] **Step 2: Connection loop test + impl**

`src/main/lcu/connection.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { LcuConnection } from './connection'
import type { LockfileInfo } from './lockfile'

const info: LockfileInfo = { processName: 'x', pid: 1, port: 1, password: 'p', protocol: 'https' }

describe('LcuConnection', () => {
  it('retries until lockfile appears, then connects once', () => {
    let present = false
    const timers: Array<() => void> = []
    const onConnected = vi.fn()
    const conn = new LcuConnection({
      readLockfile: () => (present ? info : null),
      makeClient: () => ({ close: vi.fn() }) as never,
      onConnected,
      onDisconnected: vi.fn(),
      retryMs: 5000,
      setTimeoutImpl: ((fn: () => void) => { timers.push(fn); return 0 }) as never
    })
    conn.start()
    expect(conn.state()).toBe('disconnected')
    timers.shift()!()
    expect(onConnected).not.toHaveBeenCalled()
    present = true
    timers.shift()!()
    expect(onConnected).toHaveBeenCalledTimes(1)
    expect(conn.state()).toBe('connected')
  })
})
```

`src/main/lcu/connection.ts`:

```ts
import type { LcuState } from '@shared/types'
import type { LcuClient } from './client'
import type { LockfileInfo } from './lockfile'

export class LcuConnection {
  private client: LcuClient | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private stopped = false
  private lastInfo: LockfileInfo | null = null

  constructor(
    private readonly deps: {
      readLockfile: () => LockfileInfo | null
      makeClient: (i: LockfileInfo) => LcuClient
      onConnected: (client: LcuClient) => void
      onDisconnected: () => void
      retryMs?: number
      setTimeoutImpl?: typeof setTimeout
    }
  ) {}

  state(): LcuState {
    return this.client ? 'connected' : 'disconnected'
  }

  start(): void {
    this.stopped = false
    this.tick()
  }

  stop(): void {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.drop()
  }

  /** Called by the WS close handler wired in index.ts */
  handleSocketClosed(): void {
    this.drop()
    this.schedule()
  }

  private tick(): void {
    if (this.stopped) return
    const info = this.deps.readLockfile()
    if (info && (!this.client || info.port !== this.lastInfo?.port)) {
      this.drop()
      this.lastInfo = info
      this.client = this.deps.makeClient(info)
      this.deps.onConnected(this.client)
    } else if (!info && this.client) {
      this.drop()
    }
    this.schedule()
  }

  private schedule(): void {
    const st = this.deps.setTimeoutImpl ?? setTimeout
    this.timer = st(() => this.tick(), this.deps.retryMs ?? 5000)
  }

  private drop(): void {
    if (!this.client) return
    this.client.close()
    this.client = null
    this.deps.onDisconnected()
  }
}
```

- [ ] **Step 3: Notify and tray**

`src/main/notify.ts`:

```ts
import { Notification } from 'electron'
import type { Hit } from '@shared/types'

export function notifyHit(hit: Hit, onClick?: () => void): void {
  if (!Notification.isSupported()) return
  const { gameName, tagLine, team } = hit.player
  const n = new Notification({
    title: `⚠ ${gameName}#${tagLine} is on the naughty list (${team})`,
    body: hit.flags[0]?.note ?? '',
    silent: false
  })
  if (onClick) n.on('click', onClick)
  n.show()
}
```

`src/main/tray.ts`:

```ts
import { Menu, Tray, nativeImage, app } from 'electron'
import type { LcuState } from '@shared/types'

export class AppTray {
  private tray: Tray

  constructor(private readonly onShow: () => void) {
    this.tray = new Tray(nativeImage.createEmpty())
    this.tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open Naughty List', click: onShow },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ]))
    this.tray.on('click', onShow)
    this.update('disconnected', 0)
  }

  update(state: LcuState, hitCount: number): void {
    const dot = state === 'connected' ? '🟢' : '⚪'
    this.tray.setTitle(hitCount > 0 ? `${dot} ${hitCount}` : dot) // macOS menubar text
    this.tray.setToolTip(`Naughty List: ${state}${hitCount ? `, ${hitCount} flagged in game` : ''}`)
  }
}
```

(Real icons are added in Task 16; `setTitle` is a no-op on Windows, tooltip still works.)

- [ ] **Step 4: IPC handlers**

`src/main/ipc.ts`:

```ts
import { BrowserWindow, ipcMain } from 'electron'
import type { Invoke, InvokeChannel, PushChannel, PushEvents } from '@shared/ipc'

type Handler<C extends InvokeChannel> = (...args: Invoke[C]['args']) => Promise<Invoke[C]['result']> | Invoke[C]['result']

export function handle<C extends InvokeChannel>(channel: C, fn: Handler<C>): void {
  ipcMain.handle(channel, (_e, ...args) => fn(...(args as Invoke[C]['args'])))
}

export function push<C extends PushChannel>(channel: C, payload: PushEvents[C]): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(channel, payload)
}
```

- [ ] **Step 5: Preload**

`src/preload/index.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { Invoke, InvokeChannel, PushChannel, PushEvents } from '@shared/ipc'

const api = {
  invoke<C extends InvokeChannel>(channel: C, ...args: Invoke[C]['args']): Promise<Invoke[C]['result']> {
    return ipcRenderer.invoke(channel, ...args)
  },
  on<C extends PushChannel>(channel: C, cb: (payload: PushEvents[C]) => void): () => void {
    const listener = (_: unknown, payload: PushEvents[C]): void => cb(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

export type NaughtyApi = typeof api
contextBridge.exposeInMainWorld('naughty', api)
```

`src/preload/index.d.ts`:

```ts
import type { NaughtyApi } from './index'
declare global {
  interface Window { naughty: NaughtyApi }
}
```

- [ ] **Step 6: Main index (local-only wiring; Supabase pieces plug in at Task 12)**

Replace `src/main/index.ts`:

```ts
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import WebSocket from 'ws'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { readLockfile } from './lcu/lockfile'
import { LcuClient } from './lcu/client'
import { LcuConnection } from './lcu/connection'
import { createLcuApi } from './lcu/endpoints'
import { pollPlayerList } from './live/client'
import { GameTracker } from './game/tracker'
import { SettingsStore } from './settings'
import { notifyHit } from './notify'
import { AppTray } from './tray'
import { handle, push } from './ipc'
import type { Flag } from '@shared/types'

let win: BrowserWindow | null = null
const settings = new SettingsStore(join(app.getPath('userData'), 'settings.json'))

// Flags source is swapped for the Supabase-backed store in Task 12.
let flags: Flag[] = []
const getFlags = (): Flag[] => flags

const insecureWs = class extends WebSocket {
  constructor(url: string, protocols: string[], opts: object) {
    super(url, protocols, { ...opts, rejectUnauthorized: false })
  }
} as unknown as typeof globalThis.WebSocket

const insecureFetch = (() => {
  const { Agent } = require('undici') as typeof import('undici')
  const dispatcher = new Agent({ connect: { rejectUnauthorized: false } })
  return (url: string, init: RequestInit) => fetch(url, { ...init, dispatcher } as RequestInit)
})()

let tracker: GameTracker | null = null
let tray: AppTray | null = null

const connection = new LcuConnection({
  readLockfile: () => readLockfile({ override: settings.get().lockfilePath }),
  makeClient: (info) => new LcuClient(info, { fetch: insecureFetch as never, WebSocketImpl: insecureWs }),
  onConnected: (client) => {
    const lcu = createLcuApi(client)
    tracker?.dispose()
    tracker = new GameTracker({
      lcu,
      pollLive: (signal) => pollPlayerList({ fetch: insecureFetch as never, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: Date.now }, { signal }),
      getFlags,
      onUpdate: (game, hits) => {
        push('game:update', { game, hits })
        tray?.update('connected', hits.length)
      },
      onAlert: (hit) => notifyHit(hit, () => win?.show()),
      onPlayersSeen: () => { /* Task 12 upserts players */ }
    })
    client.subscribe('OnJsonApiEvent_lol-gameflow_v1_gameflow-phase', (e) => {
      void tracker?.handlePhase(String(e.data))
    })
    void lcu.getGameflowPhase().then((p) => tracker?.handlePhase(p))
    push('lcu:state', 'connected')
    tray?.update('connected', 0)
  },
  onDisconnected: () => {
    tracker?.dispose()
    tracker = null
    push('lcu:state', 'disconnected')
    push('game:update', { game: null, hits: [] })
    tray?.update('disconnected', 0)
  }
})

function createWindow(): void {
  win = new BrowserWindow({
    width: 960, height: 680, show: false, autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  win.on('ready-to-show', () => win?.show())
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win?.hide() } })
  win.webContents.setWindowOpenHandler(({ url }) => { void shell.openExternal(url); return { action: 'deny' } })
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

let quitting = false
app.on('before-quit', () => { quitting = true })

app.whenReady().then(() => {
  electronApp.setAppUserModelId('gg.naughtylist')
  app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w))

  handle('game:get', () => tracker?.current() ?? { game: null, hits: [] })
  handle('lcu:getState', () => connection.state())
  handle('settings:get', () => ({ lockfilePath: settings.get().lockfilePath }))
  handle('settings:setLockfilePath', (p) => settings.set({ lockfilePath: p }))
  handle('flags:list', () => flags)

  createWindow()
  tray = new AppTray(() => win?.show())
  connection.start()

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); else win?.show() })
})

app.on('window-all-closed', () => { /* keep running in tray */ })
```

- [ ] **Step 7: Run tests + typecheck + dev**

`npm test` → all green. `npm run typecheck` → clean. `npm run dev` → window opens; with League client running, tray goes 🟢 and DevTools console shows no errors. Without it, tray stays ⚪ and nothing spams.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(main): wire lcu connection loop, tracker, notifications, tray and ipc

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Supabase schema, RLS, RPCs, pgTAP tests

**Files:**
- Create: `supabase/config.toml` (via CLI), `supabase/migrations/20260922000000_init.sql`, `supabase/tests/rls.test.sql`

**Interfaces:**
- Produces tables `crews`, `crew_members`, `players`, `flags`; RPCs `create_crew(p_name text) returns crews`, `join_crew(p_code text) returns crews`, `my_crew() returns crews`; realtime enabled on `flags`.

Prereq: Docker running, `npm i -D supabase`, `npx supabase init` (accept defaults).

- [ ] **Step 1: Migration**

`supabase/migrations/20260922000000_init.sql`:

```sql
create extension if not exists pgcrypto;

create table public.crews (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 40),
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.crew_members (
  crew_id uuid not null references public.crews(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  discord_name text not null default 'unknown',
  joined_at timestamptz not null default now(),
  primary key (crew_id, user_id)
);
-- MVP: one crew per user
create unique index crew_members_one_per_user on public.crew_members(user_id);

create table public.players (
  puuid text primary key,
  game_name text not null,
  tag_line text not null,
  region text,
  last_seen_at timestamptz not null default now()
);

create table public.flags (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews(id) on delete cascade,
  puuid text not null references public.players(puuid) on delete cascade,
  note text not null check (length(note) between 1 and 500),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_by_name text not null default '',
  created_at timestamptz not null default now()
);
create index flags_crew_idx on public.flags(crew_id);
create index flags_puuid_idx on public.flags(puuid);

alter table public.crews enable row level security;
alter table public.crew_members enable row level security;
alter table public.players enable row level security;
alter table public.flags enable row level security;

create or replace function public.is_crew_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.crew_members where crew_id = c and user_id = auth.uid())
$$;

create or replace function public.current_discord_name() returns text
language sql stable as $$
  select coalesce(
    auth.jwt() -> 'user_metadata' ->> 'custom_claims' -> 'global_name',
    auth.jwt() -> 'user_metadata' ->> 'full_name',
    auth.jwt() -> 'user_metadata' ->> 'name',
    'unknown')
$$;

-- crews: members can read; nobody inserts directly (use create_crew)
create policy crews_select on public.crews for select to authenticated using (public.is_crew_member(id));

-- crew_members: members can see their crew's roster
create policy crew_members_select on public.crew_members for select to authenticated using (public.is_crew_member(crew_id));

-- players: any signed-in user can read/upsert (names are public game data)
create policy players_select on public.players for select to authenticated using (true);
create policy players_insert on public.players for insert to authenticated with check (true);
create policy players_update on public.players for update to authenticated using (true) with check (true);

-- flags: crew-scoped; only author edits/deletes
create policy flags_select on public.flags for select to authenticated using (public.is_crew_member(crew_id));
create policy flags_insert on public.flags for insert to authenticated with check (public.is_crew_member(crew_id) and created_by = auth.uid());
create policy flags_update on public.flags for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy flags_delete on public.flags for delete to authenticated using (created_by = auth.uid());

create or replace function public.set_flag_author() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_by := auth.uid();
  select discord_name into new.created_by_name from public.crew_members
    where crew_id = new.crew_id and user_id = auth.uid();
  new.created_by_name := coalesce(new.created_by_name, 'unknown');
  return new;
end $$;
create trigger flags_set_author before insert on public.flags for each row execute function public.set_flag_author();

create or replace function public.create_crew(p_name text) returns public.crews
language plpgsql security definer set search_path = public as $$
declare c public.crews;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.crews (name, created_by) values (p_name, auth.uid()) returning * into c;
  insert into public.crew_members (crew_id, user_id, discord_name) values (c.id, auth.uid(), public.current_discord_name());
  return c;
end $$;

create or replace function public.join_crew(p_code text) returns public.crews
language plpgsql security definer set search_path = public as $$
declare c public.crews;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into c from public.crews where invite_code = upper(trim(p_code));
  if c.id is null then raise exception 'invalid invite code'; end if;
  insert into public.crew_members (crew_id, user_id, discord_name) values (c.id, auth.uid(), public.current_discord_name())
    on conflict do nothing;
  return c;
end $$;

create or replace function public.my_crew() returns public.crews
language sql stable security definer set search_path = public as $$
  select c.* from public.crews c join public.crew_members m on m.crew_id = c.id where m.user_id = auth.uid() limit 1
$$;

alter publication supabase_realtime add table public.flags;
```

- [ ] **Step 2: pgTAP tests**

`supabase/tests/rls.test.sql`:

```sql
begin;
select plan(6);

-- two users
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'a@test.dev'),
  ('00000000-0000-0000-0000-000000000002', 'b@test.dev');
insert into public.players (puuid, game_name, tag_line) values ('P1', 'Bad', 'GUY');

-- user A creates crew and flags P1
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","user_metadata":{"full_name":"UserA"}}';
select lives_ok($$ select public.create_crew('Crew A') $$, 'A creates crew');
select lives_ok($$ insert into public.flags (crew_id, puuid, note) select id, 'P1', 'inted' from public.my_crew() $$, 'A flags P1');
select is((select created_by_name from public.flags limit 1), 'UserA', 'author name set by trigger');

-- user B, no crew, sees nothing
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated","user_metadata":{"full_name":"UserB"}}';
select is((select count(*) from public.flags), 0::bigint, 'B cannot see crew A flags');
select throws_ok($$ select public.join_crew('NOPE1234') $$, 'invalid invite code');

-- B joins via A's code
reset role;
select public.join_crew(invite_code) from public.crews where name = 'Crew A' \gset
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated","user_metadata":{"full_name":"UserB"}}';
select throws_ok($$ delete from public.flags $$, null, 'B cannot delete A''s flag (RLS returns 0 rows, not error)');

select * from finish();
rollback;
```

Note on the last assertion: RLS silently filters deletes. Replace that `throws_ok` with:

```sql
delete from public.flags;
select is((select count(*) from public.flags), 1::bigint, 'B cannot delete A''s flag');
```

and keep `plan(6)`.

Because `join_crew` needs B's JWT, replace the `\gset` block with:

```sql
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated","user_metadata":{"full_name":"UserB"}}';
select lives_ok(format($$ select public.join_crew(%L) $$, (select invite_code from public.crews where name = 'Crew A')), 'B joins with code');
```

(`crews` select is RLS-blocked for B, so evaluate the subquery before switching role: run `reset role;` first, capture with `select invite_code into temp t from public.crews;` then use `(select invite_code from t)`.) Final file must have exactly 6 assertions; adjust `plan()` if you add more.

- [ ] **Step 3: Run**

```bash
npx supabase start
npx supabase db reset
npx supabase test db
```

Expected: `rls.test.sql .. ok`, all 6 pass.

- [ ] **Step 4: Commit**

```bash
git add supabase
git commit -m "feat(db): crews, players, flags schema with RLS, rpcs and pgtap tests

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Supabase client factory and Discord PKCE sign-in (loopback)

**Files:**
- Create: `src/main/sync/supabase.ts`, `src/main/sync/auth.ts`
- Test: `src/main/sync/auth.test.ts`

**Interfaces:**
- Produces:

```ts
// supabase.ts
export function createSupabase(opts: { url: string; anonKey: string; storageFile: string }): SupabaseClient
// auth.ts
export function parseCallbackUrl(url: string): { code: string } | { error: string }
export class AuthService {
  constructor(deps: { supabase: SupabaseClient; openExternal: (url: string) => Promise<void>; port?: number; onChange: (u: AuthUser | null) => void })
  signIn(): Promise<AuthUser>        // opens browser, waits for loopback callback, exchanges code
  signOut(): Promise<void>
  current(): Promise<AuthUser | null>
  start(): Promise<void>             // restores session, wires onAuthStateChange
}
export function toAuthUser(u: User): AuthUser
```

Env: `MAIN_VITE_SUPABASE_URL`, `MAIN_VITE_SUPABASE_ANON_KEY` in `.env` (electron-vite exposes `MAIN_VITE_*` to main via `import.meta.env`). Commit `.env.example`, not `.env`.

Supabase dashboard setup (one time, Blake): Authentication → Providers → Discord (client id/secret from a Discord application with redirect `https://<project>.supabase.co/auth/v1/callback`); Authentication → URL Configuration → add `http://localhost:53682/callback` to Redirect URLs.

- [ ] **Step 1: Failing tests**

`src/main/sync/auth.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseCallbackUrl, toAuthUser } from './auth'

describe('parseCallbackUrl', () => {
  it('extracts the code', () => {
    expect(parseCallbackUrl('/callback?code=abc123')).toEqual({ code: 'abc123' })
  })
  it('surfaces provider errors', () => {
    expect(parseCallbackUrl('/callback?error=access_denied&error_description=nope')).toEqual({ error: 'nope' })
  })
  it('rejects missing code', () => {
    expect(parseCallbackUrl('/callback')).toEqual({ error: 'missing code' })
  })
})

describe('toAuthUser', () => {
  it('prefers discord global_name, then full_name', () => {
    const u = { id: 'u1', user_metadata: { full_name: 'Blake', custom_claims: { global_name: 'blakey' } } }
    expect(toAuthUser(u as never)).toEqual({ id: 'u1', discordName: 'blakey' })
    expect(toAuthUser({ id: 'u2', user_metadata: { full_name: 'B' } } as never)).toEqual({ id: 'u2', discordName: 'B' })
  })
})
```

- [ ] **Step 2: Run** — fails.
- [ ] **Step 3: Implement**

`src/main/sync/supabase.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'

function fileStorage(file: string) {
  const load = (): Record<string, string> => {
    try { return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {} } catch { return {} }
  }
  const save = (d: Record<string, string>): void => {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(d))
  }
  return {
    getItem: (k: string): string | null => load()[k] ?? null,
    setItem: (k: string, v: string): void => { const d = load(); d[k] = v; save(d) },
    removeItem: (k: string): void => { const d = load(); delete d[k]; save(d) }
  }
}

export function createSupabase(opts: { url: string; anonKey: string; storageFile: string }): SupabaseClient {
  return createClient(opts.url, opts.anonKey, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: fileStorage(opts.storageFile)
    }
  })
}
```

`src/main/sync/auth.ts`:

```ts
import { createServer } from 'http'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { AuthUser } from '@shared/types'

export function parseCallbackUrl(url: string): { code: string } | { error: string } {
  const u = new URL(url, 'http://localhost')
  const err = u.searchParams.get('error')
  if (err) return { error: u.searchParams.get('error_description') ?? err }
  const code = u.searchParams.get('code')
  return code ? { code } : { error: 'missing code' }
}

export function toAuthUser(u: User): AuthUser {
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>
  const custom = (meta.custom_claims ?? {}) as Record<string, unknown>
  const name = (custom.global_name as string) || (meta.full_name as string) || (meta.name as string) || 'unknown'
  return { id: u.id, discordName: name }
}

export class AuthService {
  private readonly port: number

  constructor(
    private readonly deps: {
      supabase: SupabaseClient
      openExternal: (url: string) => Promise<void>
      port?: number
      onChange: (u: AuthUser | null) => void
    }
  ) {
    this.port = deps.port ?? 53682
  }

  async start(): Promise<void> {
    this.deps.supabase.auth.onAuthStateChange((_evt, session) => {
      this.deps.onChange(session?.user ? toAuthUser(session.user) : null)
    })
    this.deps.onChange(await this.current())
  }

  async current(): Promise<AuthUser | null> {
    const { data } = await this.deps.supabase.auth.getSession()
    return data.session?.user ? toAuthUser(data.session.user) : null
  }

  async signOut(): Promise<void> {
    await this.deps.supabase.auth.signOut()
  }

  async signIn(): Promise<AuthUser> {
    const redirectTo = `http://localhost:${this.port}/callback`
    const codePromise = this.waitForCallback()
    const { data, error } = await this.deps.supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: { redirectTo, skipBrowserRedirect: true }
    })
    if (error || !data.url) throw error ?? new Error('no auth url')
    await this.deps.openExternal(data.url)
    const code = await codePromise
    const ex = await this.deps.supabase.auth.exchangeCodeForSession(code)
    if (ex.error || !ex.data.session) throw ex.error ?? new Error('no session')
    return toAuthUser(ex.data.session.user)
  }

  private waitForCallback(): Promise<string> {
    return new Promise((resolve, reject) => {
      const server = createServer((req, res) => {
        const parsed = parseCallbackUrl(req.url ?? '')
        res.setHeader('Content-Type', 'text/html')
        if ('code' in parsed) {
          res.end('<h2>Signed in. You can close this tab and go back to Naughty List.</h2>')
          server.close()
          resolve(parsed.code)
        } else {
          res.statusCode = 400
          res.end(`<h2>Sign-in failed: ${parsed.error}</h2>`)
          server.close()
          reject(new Error(parsed.error))
        }
      })
      server.on('error', reject)
      server.listen(this.port, '127.0.0.1')
      setTimeout(() => { server.close(); reject(new Error('sign-in timed out')) }, 5 * 60_000).unref()
    })
  }
}
```

- [ ] **Step 4: Run** — `npm test -- auth` → 4 passed. Add `.env.example`:

```
MAIN_VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
MAIN_VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

- [ ] **Step 5: Commit**

```bash
git add src/main/sync .env.example
git commit -m "feat(sync): supabase client with file storage and discord pkce loopback sign-in

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Flag store (cache, realtime, write queue) and wiring into main

**Files:**
- Create: `src/main/sync/store.ts`
- Modify: `src/main/index.ts`
- Test: `src/main/sync/store.test.ts`

**Interfaces:**
- Consumes: `SupabaseClient`, `Flag`, `PlayerRecord`, `Crew`, `CrewMember`, `SyncStatus`.
- Produces:

```ts
export class FlagStore {
  constructor(deps: { supabase: SupabaseClient; cacheFile: string; onFlagsChanged: (flags: Flag[]) => void; onStatus: (s: SyncStatus) => void })
  start(): Promise<void>                   // load cache, then refresh + subscribe if signed in
  stop(): void
  flags(): Flag[]                          // from cache, synchronous
  refresh(): Promise<void>                 // pull crew + flags + players
  crew(): Promise<{ crew: Crew; members: CrewMember[] } | null>
  createCrew(name: string): Promise<Crew>
  joinCrew(code: string): Promise<Crew>
  addFlag(input: { puuid: string; note: string }, player?: PlayerRecord): Promise<Flag>
  deleteFlag(id: string): Promise<void>
  upsertPlayers(players: PlayerRecord[]): Promise<void>   // fire-and-forget, queued when offline
  players(): PlayerRecord[]
  status(): SyncStatus
}
```

Row mapping: `flags` row `{id, crew_id, puuid, note, created_by, created_by_name, created_at}` → `Flag`. `players` row → `PlayerRecord` (`last_seen_at` → `lastSeenAt`).

- [ ] **Step 1: Failing tests (mock supabase)**

`src/main/sync/store.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { FlagStore } from './store'

const row = { id: 'f1', crew_id: 'c1', puuid: 'P1', note: 'inted', created_by: 'u1', created_by_name: 'Blake', created_at: '2026-09-22T00:00:00Z' }

function mockSupabase(opts: { online?: boolean } = {}) {
  const online = opts.online ?? true
  const tables: Record<string, unknown[]> = { flags: [row], players: [], crew_members: [{ user_id: 'u1', discord_name: 'Blake' }] }
  const from = vi.fn((table: string) => {
    const q = {
      select: vi.fn(() => q), eq: vi.fn(() => q), order: vi.fn(() => q), single: vi.fn(() => q),
      insert: vi.fn((v: Record<string, unknown>) => { tables[table].push({ ...row, ...v, id: 'new' }); return q }),
      upsert: vi.fn(() => q), delete: vi.fn(() => q),
      then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
        online ? res({ data: table === 'flags' ? tables.flags[tables.flags.length - 1] : tables[table], error: null }) : rej(new Error('offline'))
    }
    return q
  })
  const rpc = vi.fn(async (name: string) => ({
    data: name === 'my_crew' ? { id: 'c1', name: 'Crew', invite_code: 'ABC12345' } : null, error: null
  }))
  const channel = vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis(), unsubscribe: vi.fn() }))
  return {
    from, rpc, channel, removeChannel: vi.fn(),
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
    const s = new FlagStore({ supabase: sb as never, cacheFile: file, onFlagsChanged, onStatus: vi.fn() })
    await s.start()
    expect(s.flags()).toEqual([{ id: 'f1', crewId: 'c1', puuid: 'P1', note: 'inted', createdBy: 'u1', createdByName: 'Blake', createdAt: '2026-09-22T00:00:00Z' }])
    expect(onFlagsChanged).toHaveBeenCalled()

    const offline = new FlagStore({ supabase: mockSupabase({ online: false }) as never, cacheFile: file, onFlagsChanged: vi.fn(), onStatus: vi.fn() })
    await offline.start()
    expect(offline.flags()).toHaveLength(1)
    expect(offline.status().online).toBe(false)
  })

  it('addFlag inserts and returns mapped flag', async () => {
    const sb = mockSupabase()
    const s = new FlagStore({ supabase: sb as never, cacheFile: tmp(), onFlagsChanged: vi.fn(), onStatus: vi.fn() })
    await s.start()
    const f = await s.addFlag({ puuid: 'P2', note: 'afk' }, { puuid: 'P2', gameName: 'X', tagLine: 'Y', region: null, lastSeenAt: '' })
    expect(f).toMatchObject({ puuid: 'P2', note: 'afk', crewId: 'c1' })
    expect(sb.from).toHaveBeenCalledWith('players')
    expect(s.flags().some((x) => x.puuid === 'P2')).toBe(true)
  })

  it('upsertPlayers queues when offline and reports pending writes', async () => {
    const onStatus = vi.fn()
    const s = new FlagStore({ supabase: mockSupabase({ online: false }) as never, cacheFile: tmp(), onFlagsChanged: vi.fn(), onStatus })
    await s.start()
    await s.upsertPlayers([{ puuid: 'P9', gameName: 'A', tagLine: 'B', region: null, lastSeenAt: '' }])
    expect(s.status().pendingWrites).toBe(1)
  })
})
```

- [ ] **Step 2: Run** — fails.
- [ ] **Step 3: Implement**

`src/main/sync/store.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type { Crew, CrewMember, Flag, PlayerRecord, SyncStatus } from '@shared/types'

interface FlagRow { id: string; crew_id: string; puuid: string; note: string; created_by: string; created_by_name: string; created_at: string }
interface PlayerRow { puuid: string; game_name: string; tag_line: string; region: string | null; last_seen_at: string }
interface CrewRow { id: string; name: string; invite_code: string }

interface Cache { crew: Crew | null; flags: Flag[]; players: PlayerRecord[]; lastSyncedAt: string | null }
type Pending = { kind: 'upsertPlayers'; players: PlayerRecord[] }

const mapFlag = (r: FlagRow): Flag => ({
  id: r.id, crewId: r.crew_id, puuid: r.puuid, note: r.note, createdBy: r.created_by, createdByName: r.created_by_name, createdAt: r.created_at
})
const mapPlayer = (r: PlayerRow): PlayerRecord => ({
  puuid: r.puuid, gameName: r.game_name, tagLine: r.tag_line, region: r.region, lastSeenAt: r.last_seen_at
})
const mapCrew = (r: CrewRow): Crew => ({ id: r.id, name: r.name, inviteCode: r.invite_code })
const toPlayerRow = (p: PlayerRecord): PlayerRow => ({
  puuid: p.puuid, game_name: p.gameName, tag_line: p.tagLine, region: p.region, last_seen_at: new Date().toISOString()
})

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

  flags(): Flag[] { return this.cache.flags }
  players(): PlayerRecord[] { return this.cache.players }
  status(): SyncStatus { return { online: this.online, pendingWrites: this.pending.length, lastSyncedAt: this.cache.lastSyncedAt } }

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
      if (!session.session) { this.setOnline(true); return }
      const crewRes = await this.deps.supabase.rpc('my_crew')
      if (crewRes.error) throw crewRes.error
      const crew = crewRes.data ? mapCrew(crewRes.data as CrewRow) : null
      let flags: Flag[] = []
      if (crew) {
        const f = await this.deps.supabase.from('flags').select('*').eq('crew_id', crew.id).order('created_at', { ascending: false })
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
    const m = await this.deps.supabase.from('crew_members').select('user_id, discord_name').eq('crew_id', crew.id)
    const members = ((m.data ?? []) as Array<{ user_id: string; discord_name: string }>).map((r) => ({ userId: r.user_id, discordName: r.discord_name }))
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
    const { data, error } = await this.deps.supabase.from('flags')
      .insert({ crew_id: this.cache.crew.id, puuid: input.puuid, note: input.note }).select('*').single()
    if (error) throw error
    const flag = mapFlag(data as FlagRow)
    this.cache.flags = [flag, ...this.cache.flags.filter((f) => f.id !== flag.id)]
    if (player && !this.cache.players.some((p) => p.puuid === player.puuid)) this.cache.players.push(player)
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
    try {
      const { error } = await this.deps.supabase.from('players').upsert(players.map(toPlayerRow), { onConflict: 'puuid' })
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'flags', filter: `crew_id=eq.${crew.id}` }, () => { void this.refresh() })
      .subscribe()
  }

  private setOnline(v: boolean): void {
    this.online = v
    this.deps.onStatus(this.status())
  }

  private loadCache(): void {
    try {
      if (existsSync(this.deps.cacheFile)) this.cache = { ...this.cache, ...JSON.parse(readFileSync(this.deps.cacheFile, 'utf8')) }
    } catch { /* corrupt cache: start empty */ }
  }

  private saveCache(): void {
    mkdirSync(dirname(this.deps.cacheFile), { recursive: true })
    writeFileSync(this.deps.cacheFile, JSON.stringify(this.cache))
  }
}
```

If the mock's `.in()` is missing, add `in: vi.fn(() => q)` to the test mock.

- [ ] **Step 4: Run** — `npm test -- store` → 3 passed.
- [ ] **Step 5: Wire into `src/main/index.ts`**

Replace the `let flags` block and the two placeholder spots:

```ts
import { createSupabase } from './sync/supabase'
import { AuthService } from './sync/auth'
import { FlagStore } from './sync/store'

const supabase = createSupabase({
  url: import.meta.env.MAIN_VITE_SUPABASE_URL,
  anonKey: import.meta.env.MAIN_VITE_SUPABASE_ANON_KEY,
  storageFile: join(app.getPath('userData'), 'auth.json')
})
const store = new FlagStore({
  supabase,
  cacheFile: join(app.getPath('userData'), 'cache.json'),
  onFlagsChanged: (f) => { push('flags:changed', f); tracker?.refreshHits() },
  onStatus: (s) => push('sync:status', s)
})
const auth = new AuthService({
  supabase,
  openExternal: (u) => shell.openExternal(u),
  onChange: (u) => { push('auth:changed', u); void store.refresh() }
})
const getFlags = (): Flag[] => store.flags()
```

`onPlayersSeen: (players) => void store.upsertPlayers(players.filter((p) => p.puuid).map((p) => ({ puuid: p.puuid!, gameName: p.gameName, tagLine: p.tagLine, region: null, lastSeenAt: new Date().toISOString() })))`

Add handlers inside `whenReady`:

```ts
  handle('flags:list', () => store.flags())
  handle('flags:add', async ({ puuid, note }) => {
    const known = store.players().find((p) => p.puuid === puuid)
      ?? tracker?.current().game?.players.filter((p) => p.puuid === puuid).map((p) => ({ puuid, gameName: p.gameName, tagLine: p.tagLine, region: null, lastSeenAt: new Date().toISOString() }))[0]
    return store.addFlag({ puuid, note }, known)
  })
  handle('flags:delete', (id) => store.deleteFlag(id))
  handle('players:list', () => store.players())
  handle('players:lookup', async (id) => {
    const api = currentLcuApi
    return api ? api.lookupAlias(id) : null
  })
  handle('auth:signIn', () => auth.signIn())
  handle('auth:signOut', () => auth.signOut())
  handle('auth:get', () => auth.current())
  handle('crew:get', () => store.crew())
  handle('crew:create', (name) => store.createCrew(name))
  handle('crew:join', (code) => store.joinCrew(code))
  handle('sync:status', () => store.status())
  void auth.start().then(() => store.start())
```

Keep a module-level `let currentLcuApi: LcuApi | null = null`, set in `onConnected`, nulled in `onDisconnected`. Add `import type { LcuApi } from './lcu/endpoints'`. Add to `src/main/env.d.ts`:

```ts
/// <reference types="electron-vite/node" />
interface ImportMetaEnv { readonly MAIN_VITE_SUPABASE_URL: string; readonly MAIN_VITE_SUPABASE_ANON_KEY: string }
```

- [ ] **Step 6: Verify** — `npm test`, `npm run typecheck`, `npm run dev` with a real `.env` pointing at the local `npx supabase start` instance (`http://127.0.0.1:54321`, anon key from `npx supabase status`). App boots, no red console.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(sync): flag store with cache, realtime and write queue wired into main

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Renderer shell, API wrapper, hooks, Current Game tab

**Files:**
- Create: `src/renderer/src/api.ts`, `src/renderer/src/hooks/useGame.ts`, `src/renderer/src/hooks/useFlags.ts`, `src/renderer/src/hooks/useAuth.ts`, `src/renderer/src/tabs/CurrentGame.tsx`
- Modify: `src/renderer/src/App.tsx`, `src/renderer/src/main.tsx`
- Test: `src/renderer/src/tabs/CurrentGame.test.tsx`

**Interfaces:**
- Produces:

```ts
// api.ts
export const api = window.naughty           // typed invoke/on
// hooks
export function useGame(): { game: CurrentGame | null; hits: Hit[]; lcu: LcuState }
export function useFlags(): { flags: Flag[]; add(puuid: string, note: string): Promise<void>; remove(id: string): Promise<void> }
export function useAuth(): { user: AuthUser | null; signIn(): Promise<void>; signOut(): Promise<void>; loading: boolean }
// CurrentGame props
interface Props { game: CurrentGame | null; hits: Hit[]; lcu: LcuState; onFlag(puuid: string, note: string): Promise<void> }
```

- [ ] **Step 1: api + hooks**

`src/renderer/src/api.ts`:

```ts
export const api = window.naughty
```

`src/renderer/src/hooks/useGame.ts`:

```ts
import { useEffect, useState } from 'react'
import type { CurrentGame, Hit, LcuState } from '@shared/types'
import { api } from '../api'

export function useGame(): { game: CurrentGame | null; hits: Hit[]; lcu: LcuState } {
  const [state, setState] = useState<{ game: CurrentGame | null; hits: Hit[] }>({ game: null, hits: [] })
  const [lcu, setLcu] = useState<LcuState>('disconnected')
  useEffect(() => {
    void api.invoke('game:get').then(setState)
    void api.invoke('lcu:getState').then(setLcu)
    const off1 = api.on('game:update', setState)
    const off2 = api.on('lcu:state', setLcu)
    return () => { off1(); off2() }
  }, [])
  return { ...state, lcu }
}
```

`src/renderer/src/hooks/useFlags.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'
import type { Flag } from '@shared/types'
import { api } from '../api'

export function useFlags() {
  const [flags, setFlags] = useState<Flag[]>([])
  useEffect(() => {
    void api.invoke('flags:list').then(setFlags)
    return api.on('flags:changed', setFlags)
  }, [])
  const add = useCallback(async (puuid: string, note: string) => { await api.invoke('flags:add', { puuid, note }) }, [])
  const remove = useCallback(async (id: string) => { await api.invoke('flags:delete', id) }, [])
  return { flags, add, remove }
}
```

`src/renderer/src/hooks/useAuth.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'
import type { AuthUser } from '@shared/types'
import { api } from '../api'

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    void api.invoke('auth:get').then(setUser)
    return api.on('auth:changed', setUser)
  }, [])
  const signIn = useCallback(async () => {
    setLoading(true)
    try { setUser(await api.invoke('auth:signIn')) } finally { setLoading(false) }
  }, [])
  const signOut = useCallback(async () => { await api.invoke('auth:signOut'); setUser(null) }, [])
  return { user, signIn, signOut, loading }
}
```

- [ ] **Step 2: Failing component test**

`src/renderer/src/tabs/CurrentGame.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CurrentGame } from './CurrentGame'
import type { CurrentGame as Game, Hit } from '@shared/types'

const game: Game = {
  gameId: 'g1', phase: 'InProgress', enemiesHidden: false,
  players: [
    { puuid: 'A', gameName: 'Ally', tagLine: 'NA1', team: 'ally', championName: 'Lux' },
    { puuid: 'D', gameName: 'Darius', tagLine: '0001', team: 'enemy', championName: 'Darius' }
  ]
}
const hits: Hit[] = [{ player: game.players[1], flags: [{ id: '1', crewId: 'c', puuid: 'D', note: 'inted', createdBy: 'u', createdByName: 'Blake', createdAt: '2026-09-22T00:00:00Z' }] }]

describe('CurrentGame', () => {
  it('shows disconnected state', () => {
    render(<CurrentGame game={null} hits={[]} lcu="disconnected" onFlag={vi.fn()} />)
    expect(screen.getByText(/league client not detected/i)).toBeInTheDocument()
  })
  it('highlights flagged players with notes', () => {
    render(<CurrentGame game={game} hits={hits} lcu="connected" onFlag={vi.fn()} />)
    expect(screen.getByText('Darius#0001')).toBeInTheDocument()
    expect(screen.getByText(/inted/)).toBeInTheDocument()
    expect(screen.getByText(/Blake/)).toBeInTheDocument()
  })
  it('explains hidden enemies during champ select', () => {
    render(<CurrentGame game={{ ...game, phase: 'ChampSelect', enemiesHidden: true, players: [game.players[0]] }} hits={[]} lcu="connected" onFlag={vi.fn()} />)
    expect(screen.getByText(/enemies hidden by riot until loading screen/i)).toBeInTheDocument()
  })
  it('lets you flag a player in EndOfGame', async () => {
    const onFlag = vi.fn().mockResolvedValue(undefined)
    render(<CurrentGame game={{ ...game, phase: 'EndOfGame' }} hits={[]} lcu="connected" onFlag={onFlag} />)
    await userEvent.click(screen.getAllByRole('button', { name: /flag/i })[1])
    await userEvent.type(screen.getByPlaceholderText(/what did they do/i), 'ran it down')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(onFlag).toHaveBeenCalledWith('D', 'ran it down')
  })
})
```

- [ ] **Step 3: Run** — fails.
- [ ] **Step 4: Implement component**

`src/renderer/src/tabs/CurrentGame.tsx`:

```tsx
import { useState } from 'react'
import type { CurrentGame as Game, Hit, LcuState, Player } from '@shared/types'

interface Props {
  game: Game | null
  hits: Hit[]
  lcu: LcuState
  onFlag: (puuid: string, note: string) => Promise<void>
}

export function CurrentGame({ game, hits, lcu, onFlag }: Props): JSX.Element {
  if (lcu === 'disconnected') return <Empty title="League client not detected" body="Open the League client and this will connect automatically." />
  if (!game) return <Empty title="Not in a game" body="Queue up. Flagged players show here from champ select onward." />

  const hitFor = (p: Player): Hit | undefined => hits.find((h) => h.player.puuid && h.player.puuid === p.puuid)
  const canFlag = game.phase === 'EndOfGame'
  const allies = game.players.filter((p) => p.team === 'ally')
  const enemies = game.players.filter((p) => p.team === 'enemy')

  return (
    <div className="space-y-6">
      <div className="text-sm text-zinc-400">Phase: <span className="text-zinc-100">{game.phase}</span></div>
      <TeamList title="Your team" players={allies} hitFor={hitFor} canFlag={canFlag} onFlag={onFlag} />
      {game.enemiesHidden
        ? <p className="text-sm text-zinc-500 italic">Enemies hidden by Riot until loading screen.</p>
        : <TeamList title="Enemy team" players={enemies} hitFor={hitFor} canFlag={canFlag} onFlag={onFlag} />}
    </div>
  )
}

function Empty({ title, body }: { title: string; body: string }): JSX.Element {
  return (
    <div className="rounded-lg border border-zinc-800 p-8 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-zinc-400">{body}</p>
    </div>
  )
}

function TeamList(props: { title: string; players: Player[]; hitFor: (p: Player) => Hit | undefined; canFlag: boolean; onFlag: Props['onFlag'] }): JSX.Element {
  return (
    <section>
      <h3 className="mb-2 text-xs uppercase tracking-wide text-zinc-500">{props.title}</h3>
      <ul className="space-y-2">
        {props.players.map((p, i) => <PlayerRow key={p.puuid ?? `${p.gameName}-${i}`} player={p} hit={props.hitFor(p)} canFlag={props.canFlag} onFlag={props.onFlag} />)}
      </ul>
    </section>
  )
}

function PlayerRow({ player, hit, canFlag, onFlag }: { player: Player; hit?: Hit; canFlag: boolean; onFlag: Props['onFlag'] }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const name = player.gameName ? `${player.gameName}#${player.tagLine}` : 'Hidden player'

  return (
    <li className={`rounded-md border p-3 ${hit ? 'border-red-600 bg-red-950/40' : 'border-zinc-800'}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium">{hit ? '⚠ ' : ''}{name}</div>
          {player.championName && <div className="text-xs text-zinc-500">{player.championName}</div>}
        </div>
        {canFlag && player.puuid && (
          <button className="rounded bg-zinc-800 px-3 py-1 text-sm hover:bg-zinc-700" onClick={() => setOpen((v) => !v)}>Flag</button>
        )}
      </div>
      {hit && (
        <ul className="mt-2 space-y-1 text-sm">
          {hit.flags.map((f) => <li key={f.id}><span className="text-red-300">{f.note}</span> <span className="text-zinc-500">· {f.createdByName}</span></li>)}
        </ul>
      )}
      {open && (
        <form className="mt-3 flex gap-2" onSubmit={async (e) => {
          e.preventDefault()
          if (!player.puuid || !note.trim()) return
          setSaving(true)
          try { await onFlag(player.puuid, note.trim()); setNote(''); setOpen(false) } finally { setSaving(false) }
        }}>
          <input className="flex-1 rounded bg-zinc-900 px-2 py-1 text-sm" placeholder="What did they do?" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          <button className="rounded bg-red-700 px-3 py-1 text-sm disabled:opacity-50" disabled={saving || !note.trim()}>Save</button>
        </form>
      )}
    </li>
  )
}
```

- [ ] **Step 5: App shell**

`src/renderer/src/App.tsx`:

```tsx
import { useState } from 'react'
import { CurrentGame } from './tabs/CurrentGame'
import { NaughtyList } from './tabs/NaughtyList'
import { Crew } from './tabs/Crew'
import { useGame } from './hooks/useGame'
import { useFlags } from './hooks/useFlags'
import { useAuth } from './hooks/useAuth'

type Tab = 'game' | 'list' | 'crew'

export default function App(): JSX.Element {
  const [tab, setTab] = useState<Tab>('game')
  const gameState = useGame()
  const flagsState = useFlags()
  const authState = useAuth()

  const tabs: Array<[Tab, string]> = [['game', 'Current game'], ['list', 'Naughty list'], ['crew', 'Crew']]
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        <h1 className="text-lg font-bold">Naughty List</h1>
        <nav className="flex gap-1">
          {tabs.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`rounded px-3 py-1 text-sm ${tab === id ? 'bg-zinc-800' : 'hover:bg-zinc-900'}`}>{label}</button>
          ))}
        </nav>
        <span className={`text-xs ${gameState.lcu === 'connected' ? 'text-green-400' : 'text-zinc-500'}`}>
          {gameState.lcu === 'connected' ? '● client connected' : '○ client offline'}
        </span>
      </header>
      <main className="mx-auto max-w-3xl p-6">
        {tab === 'game' && <CurrentGame {...gameState} onFlag={flagsState.add} />}
        {tab === 'list' && <NaughtyList flags={flagsState.flags} onAdd={flagsState.add} onRemove={flagsState.remove} userId={authState.user?.id ?? null} />}
        {tab === 'crew' && <Crew auth={authState} />}
      </main>
    </div>
  )
}
```

`NaughtyList` and `Crew` are created in Tasks 14 and 15; until then create stubs exporting components that render `null` with the same props so `typecheck` passes.

- [ ] **Step 6: Run** — `npm test` → all green (CurrentGame 4 passed). `npm run dev` shows the shell.
- [ ] **Step 7: Commit**

```bash
git add src/renderer
git commit -m "feat(ui): app shell, ipc hooks and current game tab

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: Naughty List tab

**Files:**
- Create: `src/renderer/src/tabs/NaughtyList.tsx` (replace stub), `src/renderer/src/hooks/usePlayers.ts`
- Test: `src/renderer/src/tabs/NaughtyList.test.tsx`

**Interfaces:**
- Props: `{ flags: Flag[]; onAdd(puuid: string, note: string): Promise<void>; onRemove(id: string): Promise<void>; userId: string | null }`
- `usePlayers(): { players: PlayerRecord[]; lookup(id: RiotId): Promise<PlayerRecord | null> }` — calls `players:list` and `players:lookup`.

- [ ] **Step 1: Failing test**

`src/renderer/src/tabs/NaughtyList.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NaughtyList } from './NaughtyList'
import type { Flag } from '@shared/types'

const flags: Flag[] = [
  { id: '1', crewId: 'c', puuid: 'D', note: 'inted', createdBy: 'me', createdByName: 'Blake', createdAt: '2026-09-22T00:00:00Z' },
  { id: '2', crewId: 'c', puuid: 'E', note: 'afk', createdBy: 'other', createdByName: 'Friend', createdAt: '2026-09-21T00:00:00Z' }
]

beforeEach(() => {
  window.naughty = {
    invoke: vi.fn(async (ch: string, ...args: unknown[]) => {
      if (ch === 'players:list') return [
        { puuid: 'D', gameName: 'Darius', tagLine: '0001', region: null, lastSeenAt: '' },
        { puuid: 'E', gameName: 'Ezreal', tagLine: 'NA1', region: null, lastSeenAt: '' }
      ]
      if (ch === 'players:lookup') return { puuid: 'N', gameName: (args[0] as { gameName: string }).gameName, tagLine: 'TAG', region: null, lastSeenAt: '' }
      return null
    }),
    on: vi.fn(() => () => {})
  } as never
})

describe('NaughtyList', () => {
  it('lists players with notes and filters by search', async () => {
    render(<NaughtyList flags={flags} onAdd={vi.fn()} onRemove={vi.fn()} userId="me" />)
    expect(await screen.findByText('Darius#0001')).toBeInTheDocument()
    await userEvent.type(screen.getByPlaceholderText(/search/i), 'ezr')
    expect(screen.queryByText('Darius#0001')).not.toBeInTheDocument()
    expect(screen.getByText('Ezreal#NA1')).toBeInTheDocument()
  })
  it('only shows delete on own notes', async () => {
    const onRemove = vi.fn()
    render(<NaughtyList flags={flags} onAdd={vi.fn()} onRemove={onRemove} userId="me" />)
    await screen.findByText('Darius#0001')
    const dels = screen.getAllByRole('button', { name: /delete/i })
    expect(dels).toHaveLength(1)
    await userEvent.click(dels[0])
    expect(onRemove).toHaveBeenCalledWith('1')
  })
  it('adds by riot id via lookup', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    render(<NaughtyList flags={[]} onAdd={onAdd} onRemove={vi.fn()} userId="me" />)
    await userEvent.type(screen.getByPlaceholderText(/gamename#tag/i), 'NewGuy#TAG')
    await userEvent.type(screen.getByPlaceholderText(/what did they do/i), 'griefed')
    await userEvent.click(screen.getByRole('button', { name: /add/i }))
    expect(onAdd).toHaveBeenCalledWith('N', 'griefed')
  })
})
```

- [ ] **Step 2: Run** — fails.
- [ ] **Step 3: Implement**

`src/renderer/src/hooks/usePlayers.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'
import type { PlayerRecord, RiotId } from '@shared/types'
import { api } from '../api'

export function usePlayers(deps: unknown[] = []) {
  const [players, setPlayers] = useState<PlayerRecord[]>([])
  useEffect(() => { void api.invoke('players:list').then(setPlayers) }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  const lookup = useCallback((id: RiotId) => api.invoke('players:lookup', id), [])
  return { players, lookup }
}
```

`src/renderer/src/tabs/NaughtyList.tsx`:

```tsx
import { useMemo, useState } from 'react'
import type { Flag } from '@shared/types'
import { usePlayers } from '../hooks/usePlayers'

interface Props {
  flags: Flag[]
  onAdd: (puuid: string, note: string) => Promise<void>
  onRemove: (id: string) => Promise<void>
  userId: string | null
}

export function NaughtyList({ flags, onAdd, onRemove, userId }: Props): JSX.Element {
  const { players, lookup } = usePlayers([flags.length])
  const [q, setQ] = useState('')
  const [riotId, setRiotId] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const grouped = useMemo(() => {
    const byPuuid = new Map<string, Flag[]>()
    for (const f of flags) byPuuid.set(f.puuid, [...(byPuuid.get(f.puuid) ?? []), f])
    const rows = [...byPuuid.entries()].map(([puuid, fs]) => {
      const p = players.find((x) => x.puuid === puuid)
      const name = p ? `${p.gameName}#${p.tagLine}` : puuid
      return { puuid, name, flags: fs }
    })
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => !needle || r.name.toLowerCase().includes(needle) || r.flags.some((f) => f.note.toLowerCase().includes(needle)))
  }, [flags, players, q])

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setErr(null)
    const m = riotId.trim().match(/^(.+?)#(.+)$/)
    if (!m) { setErr('Use the format GameName#TAG'); return }
    setBusy(true)
    try {
      const rec = await lookup({ gameName: m[1], tagLine: m[2] })
      if (!rec) { setErr('Player not found. Is the League client open?'); return }
      await onAdd(rec.puuid, note.trim())
      setRiotId(''); setNote('')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="flex flex-wrap gap-2 rounded-lg border border-zinc-800 p-3">
        <input className="min-w-40 flex-1 rounded bg-zinc-900 px-2 py-1 text-sm" placeholder="GameName#TAG" value={riotId} onChange={(e) => setRiotId(e.target.value)} />
        <input className="min-w-60 flex-[2] rounded bg-zinc-900 px-2 py-1 text-sm" placeholder="What did they do?" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        <button className="rounded bg-red-700 px-3 py-1 text-sm disabled:opacity-50" disabled={busy || !riotId.trim() || !note.trim()}>Add</button>
        {err && <p className="w-full text-xs text-red-400">{err}</p>}
      </form>

      <input className="w-full rounded bg-zinc-900 px-3 py-2 text-sm" placeholder="Search players or notes" value={q} onChange={(e) => setQ(e.target.value)} />

      {grouped.length === 0 && <p className="text-sm text-zinc-500">Nobody on the list yet.</p>}
      <ul className="space-y-3">
        {grouped.map((row) => (
          <li key={row.puuid} className="rounded-md border border-zinc-800 p-3">
            <div className="font-medium">{row.name}</div>
            <ul className="mt-2 space-y-1 text-sm">
              {row.flags.map((f) => (
                <li key={f.id} className="flex items-start justify-between gap-3">
                  <span><span className="text-red-300">{f.note}</span> <span className="text-zinc-500">· {f.createdByName} · {new Date(f.createdAt).toLocaleDateString()}</span></span>
                  {f.createdBy === userId && (
                    <button aria-label="Delete note" className="text-xs text-zinc-500 hover:text-red-400" onClick={() => void onRemove(f.id)}>Delete</button>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Run** — `npm test -- NaughtyList` → 3 passed.
- [ ] **Step 5: Commit**

```bash
git add src/renderer
git commit -m "feat(ui): naughty list tab with search, manual add and delete

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: Crew tab (sign in, create/join, roster, sync status, lockfile override)

**Files:**
- Create: `src/renderer/src/tabs/Crew.tsx` (replace stub)
- Test: `src/renderer/src/tabs/Crew.test.tsx`

**Interfaces:**
- Props: `{ auth: ReturnType<typeof useAuth> }`. Uses `api.invoke('crew:get' | 'crew:create' | 'crew:join' | 'sync:status' | 'settings:get' | 'settings:setLockfilePath')` and `api.on('sync:status')`.

- [ ] **Step 1: Failing test**

`src/renderer/src/tabs/Crew.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Crew } from './Crew'

const auth = (user: { id: string; discordName: string } | null) => ({ user, signIn: vi.fn(), signOut: vi.fn(), loading: false })

beforeEach(() => {
  window.naughty = {
    invoke: vi.fn(async (ch: string, ...args: unknown[]) => {
      if (ch === 'crew:get') return null
      if (ch === 'crew:join') return { id: 'c', name: 'Boys', inviteCode: args[0] }
      if (ch === 'sync:status') return { online: true, pendingWrites: 0, lastSyncedAt: null }
      if (ch === 'settings:get') return { lockfilePath: null }
      return null
    }),
    on: vi.fn(() => () => {})
  } as never
})

describe('Crew', () => {
  it('prompts sign in when signed out', () => {
    const a = auth(null)
    render(<Crew auth={a} />)
    expect(screen.getByRole('button', { name: /sign in with discord/i })).toBeInTheDocument()
  })
  it('joins a crew with an invite code', async () => {
    render(<Crew auth={auth({ id: 'u', discordName: 'Blake' })} />)
    await userEvent.type(await screen.findByPlaceholderText(/invite code/i), 'ABC12345')
    await userEvent.click(screen.getByRole('button', { name: /join/i }))
    expect(window.naughty.invoke).toHaveBeenCalledWith('crew:join', 'ABC12345')
  })
})
```

- [ ] **Step 2: Run** — fails.
- [ ] **Step 3: Implement**

`src/renderer/src/tabs/Crew.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { Crew as CrewT, CrewMember, SyncStatus } from '@shared/types'
import { api } from '../api'
import type { useAuth } from '../hooks/useAuth'

interface Props { auth: ReturnType<typeof useAuth> }

export function Crew({ auth }: Props): JSX.Element {
  const [crew, setCrew] = useState<{ crew: CrewT; members: CrewMember[] } | null>(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [sync, setSync] = useState<SyncStatus | null>(null)
  const [lockfile, setLockfile] = useState<string>('')

  useEffect(() => {
    if (!auth.user) { setCrew(null); return }
    void api.invoke('crew:get').then(setCrew)
  }, [auth.user])

  useEffect(() => {
    void api.invoke('sync:status').then(setSync)
    void api.invoke('settings:get').then((s) => setLockfile(s.lockfilePath ?? ''))
    return api.on('sync:status', setSync)
  }, [])

  async function run(fn: () => Promise<unknown>): Promise<void> {
    setErr(null)
    try { await fn(); setCrew(await api.invoke('crew:get')) } catch (e) { setErr((e as Error).message) }
  }

  if (!auth.user) {
    return (
      <div className="rounded-lg border border-zinc-800 p-8 text-center">
        <p className="mb-4 text-sm text-zinc-400">Sign in so your flags sync with your crew.</p>
        <button className="rounded bg-indigo-600 px-4 py-2 text-sm disabled:opacity-50" disabled={auth.loading} onClick={() => void auth.signIn()}>
          Sign in with Discord
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between text-sm">
        <span>Signed in as <b>{auth.user.discordName}</b></span>
        <button className="text-zinc-400 hover:text-zinc-100" onClick={() => void auth.signOut()}>Sign out</button>
      </div>

      {crew ? (
        <section className="rounded-lg border border-zinc-800 p-4">
          <h2 className="font-semibold">{crew.crew.name}</h2>
          <p className="mt-1 text-sm text-zinc-400">Invite code: <code className="rounded bg-zinc-900 px-2 py-0.5">{crew.crew.inviteCode}</code>
            <button className="ml-2 text-xs text-indigo-400" onClick={() => void navigator.clipboard.writeText(crew.crew.inviteCode)}>copy</button></p>
          <ul className="mt-3 text-sm">{crew.members.map((m) => <li key={m.userId}>{m.discordName}</li>)}</ul>
        </section>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2">
          <form className="rounded-lg border border-zinc-800 p-4" onSubmit={(e) => { e.preventDefault(); void run(() => api.invoke('crew:join', code.trim())) }}>
            <h2 className="mb-2 font-semibold">Join a crew</h2>
            <input className="w-full rounded bg-zinc-900 px-2 py-1 text-sm" placeholder="Invite code" value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="mt-2 rounded bg-indigo-600 px-3 py-1 text-sm disabled:opacity-50" disabled={!code.trim()}>Join</button>
          </form>
          <form className="rounded-lg border border-zinc-800 p-4" onSubmit={(e) => { e.preventDefault(); void run(() => api.invoke('crew:create', name.trim())) }}>
            <h2 className="mb-2 font-semibold">Create a crew</h2>
            <input className="w-full rounded bg-zinc-900 px-2 py-1 text-sm" placeholder="Crew name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
            <button className="mt-2 rounded bg-zinc-700 px-3 py-1 text-sm disabled:opacity-50" disabled={!name.trim()}>Create</button>
          </form>
        </section>
      )}
      {err && <p className="text-sm text-red-400">{err}</p>}

      <section className="text-xs text-zinc-500">
        Sync: {sync?.online ? 'online' : 'offline (using cached list)'}{sync?.pendingWrites ? `, ${sync.pendingWrites} pending` : ''}
      </section>

      <section className="rounded-lg border border-zinc-800 p-4">
        <h2 className="mb-1 text-sm font-semibold">League lockfile path (advanced)</h2>
        <p className="mb-2 text-xs text-zinc-500">Leave empty for the default install location.</p>
        <input className="w-full rounded bg-zinc-900 px-2 py-1 text-sm" value={lockfile} placeholder="default" onChange={(e) => setLockfile(e.target.value)}
          onBlur={() => void api.invoke('settings:setLockfilePath', lockfile.trim() || null)} />
      </section>
    </div>
  )
}
```

- [ ] **Step 4: Run** — `npm test` → all green. `npm run typecheck` clean.
- [ ] **Step 5: End-to-end manual check (needs `.env`, Supabase project with Discord provider, League client)**

1. `npm run dev`, Crew tab → Sign in with Discord → browser opens → returns "Signed in".
2. Create crew, copy code. Second account (or a friend) joins.
3. Naughty list tab → add `SomeFriend#TAG` with a note. Appears on both machines within a second.
4. Play/spectate an ARAM with that friend → toast at loading screen, row highlighted red.

- [ ] **Step 6: Commit**

```bash
git add src/renderer
git commit -m "feat(ui): crew tab with discord sign-in, join/create, sync status and lockfile override

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 16: Packaging, auto-update, release workflow, README

**Files:**
- Create: `electron-builder.yml` (replace template), `.github/workflows/release.yml`, `resources/icon.png` (1024×1024), `resources/trayTemplate.png` (22×22 black-on-transparent, macOS template) + `resources/tray.png` (Windows), `README.md`
- Modify: `src/main/index.ts` (updater + real tray icons), `src/main/tray.ts`, `package.json`

- [ ] **Step 1: electron-builder config**

`electron-builder.yml`:

```yaml
appId: gg.naughtylist
productName: Naughty List
directories:
  buildResources: resources
files:
  - '!**/.vscode/*'
  - '!src/*'
  - '!electron.vite.config.{js,ts,mjs,cjs}'
  - '!{.eslintignore,.eslintrc.cjs,.prettierignore,.prettierrc.yaml,dev-app-update.yml,CHANGELOG.md,README.md}'
  - '!{.env,.env.*,.npmrc,pnpm-lock.yaml}'
  - '!{tsconfig.json,tsconfig.node.json,tsconfig.web.json}'
  - '!supabase/*'
  - '!test/*'
  - '!docs/*'
asarUnpack:
  - resources/**
win:
  executableName: NaughtyList
  target: [nsis]
nsis:
  artifactName: ${name}-${version}-setup.${ext}
  shortcutName: ${productName}
  uninstallDisplayName: ${productName}
  createDesktopShortcut: always
mac:
  target:
    - target: dmg
      arch: [arm64, x64]
    - target: zip
      arch: [arm64, x64]
  category: public.app-category.games
  identity: null          # unsigned for MVP; friends right-click → Open once
  hardenedRuntime: false
dmg:
  artifactName: ${name}-${version}-${arch}.${ext}
npmRebuild: false
publish:
  provider: github
  owner: blakedoyle93
  repo: naughty-list
  releaseType: release
```

- [ ] **Step 2: Tray icons + updater**

In `src/main/tray.ts` replace `nativeImage.createEmpty()` with:

```ts
import { join } from 'path'
const iconPath = process.platform === 'darwin' ? join(__dirname, '../../resources/trayTemplate.png') : join(__dirname, '../../resources/tray.png')
this.tray = new Tray(nativeImage.createFromPath(iconPath))
```

In `src/main/index.ts` inside `whenReady`, after `connection.start()`:

```ts
import { autoUpdater } from 'electron-updater'
// ...
if (!is.dev) {
  autoUpdater.autoDownload = true
  autoUpdater.on('update-downloaded', () => { /* installs on quit */ })
  void autoUpdater.checkForUpdatesAndNotify()
}
```

Generate placeholder icons if none exist (any 1024×1024 PNG works; a red circle with a white list glyph is fine):

```bash
mkdir -p resources
# macOS: sips can create from an existing png; otherwise drop files in manually
```

- [ ] **Step 3: Release workflow**

`.github/workflows/release.yml`:

```yaml
name: release
on:
  push:
    tags: ['v*']
permissions:
  contents: write
jobs:
  build:
    strategy:
      matrix:
        os: [macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm test
      - run: npm run build
      - name: Package + publish
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          MAIN_VITE_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          MAIN_VITE_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
          CSC_IDENTITY_AUTO_DISCOVERY: false
        run: npx electron-builder --publish always
```

Note: `MAIN_VITE_*` must be present at `npm run build` time too (Vite inlines them). Move the two env vars to the job level `env:`.

- [ ] **Step 4: README**

`README.md` covers: what it does, install (download `.dmg`/`-setup.exe` from Releases; macOS right-click → Open), first run (Sign in with Discord, join crew with code), how detection works (champ select allies / loading screen everyone), dev setup (`cp .env.example .env`, `npx supabase start`, `npm run dev`), release (`npm version patch && git push --tags`), and the Riot policy note verbatim from the spec section 2.

- [ ] **Step 5: Verify**

`npm run build:mac` locally → `dist/naughty-list-0.1.0-arm64.dmg` opens, app launches, tray icon shows. `npm test` green.

- [ ] **Step 6: Commit and tag**

```bash
git add -A
git commit -m "chore: packaging, auto-update, release workflow and readme

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Tagging + pushing waits for Blake to create the private GitHub repo and add `SUPABASE_URL` / `SUPABASE_ANON_KEY` secrets.

---

## Self-review

**Spec coverage**
- §3 platform facts → Tasks 5, 6, 8 (champ select allies only, live client at InProgress, EOG). ✔
- §4.1 modules → Tasks 3–9, 11, 12; `zod` validation everywhere external JSON enters. ✔
- §4.2 three tabs + tray → Tasks 13–15, tray in 9/16. ✔
- §4.3 schema, RLS, realtime → Task 10; realtime consumed in Task 12. ✔
- §5 flows: alert (8), add from EOG (13) and manual (14), join crew (15). ✔
- §6 error table: client absent (9), live timeout (6), offline cache + queue (12), lookup failure keeps `puuid: null` (8), zod degrade (5, 6). ✔
- §7 testing: fixtures (5, 6), pure unit tests (7), pgTAP (10), renderer tests (13–15), manual smoke (15). ✔
- §8 build/distribution → Task 16. ✔

**Gaps accepted for MVP:** "keep last game viewable for 10 min" (§5.1 step 4) is simplified to clearing on `Lobby`/`None`; EOG stays visible until the player leaves the post-game screen. Noted here so it's a conscious cut.

**Type consistency:** `Player.puuid: string | null`, `Hit`, `Flag`, `PlayerRecord`, `LcuApi`, `TrackerDeps`, `FlagStore` method names, IPC channel names all match between definition and use. `FetchLike` is defined in Task 4 and reused in 6. `Invoke['flags:add']` takes `{ puuid, note }` in 2, 12, 13, 14.
