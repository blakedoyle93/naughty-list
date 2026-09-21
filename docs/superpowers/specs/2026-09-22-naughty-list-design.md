# Naughty List — Design Spec

**Date:** 2026-09-22
**Status:** Approved for planning
**Platforms:** Windows 10/11, macOS 13+

## 1. Purpose

A desktop companion for League of Legends that lets a private group of
friends ("crew") keep a shared list of players who did something naughty,
with notes, and get alerted when one of those players is in the current
game, on either team.

Success for MVP: a friend flags a player after a game; the next time anyone
in the crew loads into a game with that player, they get an OS notification
and see the note in the app before the game starts.

## 2. Constraints and non-goals

- Uses only Riot-tolerated local APIs: the **LCU API** (League client,
  `127.0.0.1:<lockfile port>`, basic auth from `lockfile`) and the
  **Live Client Data API** (`https://127.0.0.1:2999/liveclientdata`).
  No memory reading, no game-process hooks. Riot's Vanguard FAQ states
  apps built on these APIs are expected to keep working.
- Private distribution to a friend group via GitHub Releases. No store
  listing, no public signup.
- Out of scope for MVP: in-game overlay, severity colours/tiers, mobile
  app, public/shared-between-crews lists, Korean region (LCU apps are
  prohibited there by Riot policy).
- Known paper risk: Riot's LCU policy asks developers to request approval
  before releasing LCU apps. Accepted for a private tool.

## 3. Key platform facts that shape the design

| Phase (`lol-gameflow`) | Who is identifiable | Source |
|---|---|---|
| `ChampSelect` | Teammates only, only when `myTeam[].summonerId != 0` (normals/ARAM; hidden in ranked). Enemies never. | LCU `/lol-champ-select/v1/session` |
| `InProgress` (loading screen onward) | All 10 players by Riot ID (`riotIdGameName#riotIdTagLine`) | Live Client `/liveclientdata/playerlist` (port 2999, appears a few seconds after phase change) |
| `EndOfGame` | All 10 players with PUUID | LCU `/lol-end-of-game/v1/eog-stats-block` |

Identity key everywhere is **PUUID**. Riot IDs change; PUUIDs do not.
Riot ID → PUUID resolution goes through LCU `/lol-summoner/v1/alias/lookup`
(requires client running).

## 4. Architecture

Single repo `naughty-list`, single package, scaffolded from `electron-vite`
(React + TypeScript). Supabase is the backend.

### 4.1 Electron main process (Node)

Modules, each behind a small interface so Riot endpoint changes stay local:

- `lcu/lockfile.ts` — locate and parse `lockfile`. Default paths:
  - macOS: `/Applications/League of Legends.app/Contents/LoL/lockfile`
  - Windows: `C:\Riot Games\League of Legends\lockfile`
  - User-overridable in settings. Retry every 5 s while absent.
- `lcu/client.ts` — HTTPS + WebSocket to the LCU using lockfile creds.
  `https.Agent({ rejectUnauthorized: false })` scoped to `127.0.0.1`.
  Subscribes to `OnJsonApiEvent_lol-gameflow_v1_gameflow-phase`.
- `live/client.ts` — polls `https://127.0.0.1:2999/liveclientdata/playerlist`
  every 1 s for up to 60 s after `InProgress`, same insecure agent.
- `game/tracker.ts` — state machine over gameflow phases; produces a
  `CurrentGame { gameId, players: Player[] }` where
  `Player { puuid?, gameName, tagLine, team: 'ally'|'enemy', championName? }`.
- `match/matcher.ts` — pure function: `(players, flags) => Hit[]`.
  Dedupes alerts per `gameId` so re-polls never re-fire.
- `notify.ts` — Electron `Notification`, one per hit:
  `"⚠ {gameName}#{tag} is on the naughty list"` / body = latest note.
- `sync/store.ts` — Supabase client (service key never shipped; anon key +
  user JWT). Keeps a local JSON cache at `app.getPath('userData')/cache.json`
  of the crew's flags and players so matching works offline; queues writes
  and retries.
- `ipc.ts` — typed IPC surface for the renderer (contextIsolation on,
  nodeIntegration off).

### 4.2 Renderer (React + Vite + Tailwind)

Three tabs:

1. **Current game** — 10 rows grouped ally/enemy; flagged rows highlighted
   with all notes from the crew. In `ChampSelect` shows "enemies hidden by
   Riot until loading screen". In `EndOfGame` every row gets a **Flag**
   button + note field.
2. **Naughty list** — searchable table of flagged players, notes with
   author + date, add-by-Riot-ID input, edit/delete own notes.
3. **Crew** — sign in with Discord, create crew or join by invite code,
   member list, copyable invite code.

Tray icon reflects state: grey = client not found, green = connected,
red badge = flagged player in current game.

### 4.3 Supabase

Auth: Discord OAuth. One crew per user for MVP (schema allows more later).

```sql
crews         (id uuid pk, name text, invite_code text unique, created_by uuid, created_at)
crew_members  (crew_id fk, user_id fk, discord_name text, joined_at, pk(crew_id,user_id))
players       (puuid text pk, game_name text, tag_line text, region text, last_seen_at)
flags         (id uuid pk, crew_id fk, puuid fk, note text, created_by uuid, created_at)
```

RLS: a row in `crews`/`flags` is readable and writable only by members of
that crew; `flags` deletable/updatable only by `created_by`. `players` is
readable by any authenticated user, upserted by the app on sighting.

Realtime: renderer subscribes to `flags` for its crew so a friend's new
flag appears without restart; main process refreshes its cache on the
same event.

## 5. Flows

### 5.1 Alert
1. `ChampSelect` → resolve identifiable teammates → match → toast +
   highlight on hits.
2. `InProgress` → poll Live Client until `playerlist` responds → resolve
   all 10 Riot IDs → upsert `players` → match → one toast per new hit.
3. `EndOfGame` → read EOG block → Current game tab becomes flag-anyone
   list.
4. Any other phase → clear current game, keep last game viewable for 10 min.

### 5.2 Add to list
- From EndOfGame rows (primary). PUUID already known.
- Manually by `GameName#TAG` from the Naughty list tab; resolved via LCU.
  Disabled with explanation when client is not running.

### 5.3 Join crew
Discord sign-in → paste invite code → `crew_members` insert via RPC that
validates the code → cache refresh.

## 6. Error handling

| Situation | Behaviour |
|---|---|
| Client not running | Grey tray, retry lockfile every 5 s, no toasts |
| Live Client never answers within 60 s | Stop polling, show "couldn't read game", no crash |
| Offline / Supabase down | Match from cache, queue writes, banner in app |
| Riot ID resolution fails for one player | Show row without PUUID, unmatchable, tooltip says why |
| LCU endpoint shape changes | Zod-validated responses; failure logs + degrades to "unknown" rather than throwing |

## 7. Testing

- `lcu/`, `live/`, `game/tracker.ts` tested against recorded JSON fixtures
  captured from a real client (`session`, `playerlist`, `eog-stats-block`).
- `match/matcher.ts` and dedupe: pure functions, Vitest unit tests.
- RLS: pgTAP tests in `supabase/tests` — crew A cannot read crew B's flags,
  non-author cannot edit a note.
- Renderer: Vitest + Testing Library for the three tabs against a mocked
  IPC layer.
- Manual smoke before each release: one ARAM with a friend pre-flagged.

## 8. Build and distribution

- `electron-builder` targets: `dmg` (arm64 + x64) and `nsis` exe.
- GitHub Actions on `v*` tag builds both and publishes to GitHub Releases;
  `electron-updater` checks that feed on launch.
- Mac builds unsigned for MVP: friends right-click → Open once. Apple
  notarisation ($99/yr) is a later upgrade. Windows will show SmartScreen
  "unknown publisher" once.
- Secrets: Supabase URL + anon key baked in (public by design); no service
  key in the app.

## 9. Open decisions deferred past MVP

Severity tiers, per-note reactions, multiple crews per user, Korea
handling, signed/notarised builds.
