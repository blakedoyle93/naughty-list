import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import WebSocket from 'ws'
import { insecureLocalFetch } from './localFetch'
import { searchOpgg } from './opgg'
import { createResolver } from './names'
import { autoUpdater } from 'electron-updater'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { readLockfile } from './lcu/lockfile'
import { LcuClient, type WsLike } from './lcu/client'
import { LcuConnection } from './lcu/connection'
import { createLcuApi, type LcuApi } from './lcu/endpoints'
import { pollPlayerList } from './live/client'
import { GameTracker } from './game/tracker'
import { SettingsStore } from './settings'
import { notifyHit } from './notify'
import { AppTray } from './tray'
import { handle, push } from './ipc'
import { createSupabase } from './sync/supabase'
import { AuthService } from './sync/auth'
import { FlagStore } from './sync/store'
import type { Flag, PlayerRecord } from '@shared/types'

// ---- local Riot APIs: self-signed certs on 127.0.0.1 only -------------------

const makeLocalWs = (url: string, headers: Record<string, string>): WsLike =>
  new WebSocket(url, ['wamp'], { headers, rejectUnauthorized: false }) as unknown as WsLike

// ---- state -------------------------------------------------------------------

let win: BrowserWindow | null = null
let tray: AppTray | null = null
let tracker: GameTracker | null = null
let currentLcuApi: LcuApi | null = null
let quitting = false

const userData = app.getPath('userData')
const settings = new SettingsStore(join(userData, 'settings.json'))

const supabase = createSupabase({
  url: import.meta.env.MAIN_VITE_SUPABASE_URL,
  anonKey: import.meta.env.MAIN_VITE_SUPABASE_ANON_KEY,
  storageFile: join(userData, 'auth.json')
})
const store = new FlagStore({
  supabase,
  cacheFile: join(userData, 'cache.json'),
  onFlagsChanged: (f) => {
    push('flags:changed', f)
    tracker?.refreshHits()
  },
  onStatus: (s) => push('sync:status', s)
})
const auth = new AuthService({
  supabase,
  openExternal: (u) => shell.openExternal(u),
  onChange: (u) => {
    push('auth:changed', u)
    void store.refresh()
  }
})
const getFlags = (): Flag[] => store.flags()

const connection = new LcuConnection({
  readLockfile: () => readLockfile({ override: settings.get().lockfilePath }),
  makeClient: (info) => new LcuClient(info, { fetch: insecureLocalFetch, makeWs: makeLocalWs }),
  onConnected: (client) => {
    const lcu = createLcuApi(client)
    currentLcuApi = lcu
    tracker?.dispose()
    tracker = new GameTracker({
      lcu,
      pollLive: (signal) =>
        pollPlayerList(
          {
            fetch: insecureLocalFetch,
            sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
            now: Date.now
          },
          { signal }
        ),
      getFlags,
      onUpdate: (game, hits) => {
        push('game:update', { game, hits })
        tray?.update('connected', hits.length)
      },
      onAlert: (hit) => notifyHit(hit, () => win?.show()),
      onPlayersSeen: (players) => {
        const recs: PlayerRecord[] = players
          .filter((p) => p.puuid)
          .map((p) => ({
            puuid: p.puuid!,
            gameName: p.gameName,
            tagLine: p.tagLine,
            region: null,
            lastSeenAt: new Date().toISOString()
          }))
        void store.upsertPlayers(recs)
      }
    })
    client.subscribe('OnJsonApiEvent_lol-gameflow_v1_gameflow-phase', (e) => {
      void tracker?.handlePhase(String(e.data))
    })
    void lcu
      .getGameflowPhase()
      .then((p) => tracker?.handlePhase(p))
      .catch(() => {})
    push('lcu:state', 'connected')
    tray?.update('connected', 0)
  },
  onDisconnected: () => {
    tracker?.dispose()
    tracker = null
    currentLcuApi = null
    push('lcu:state', 'disconnected')
    push('game:update', { game: null, hits: [] })
    tray?.update('disconnected', 0)
  }
})

// ---- window ------------------------------------------------------------------

function createWindow(): void {
  win = new BrowserWindow({
    width: 960,
    height: 680,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.on('ready-to-show', () => win?.show())
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault()
      win?.hide()
    }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.on('before-quit', () => {
  quitting = true
})

// Last line of defence: a tray app must never die on a crash dialog because League hiccuped.
process.on('uncaughtException', (err) => console.error('[main] uncaught', err))
process.on('unhandledRejection', (err) => console.error('[main] unhandled rejection', err))

void app.whenReady().then(() => {
  electronApp.setAppUserModelId('gg.naughtylist')
  app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w))

  handle('game:get', () => tracker?.current() ?? { game: null, hits: [] })
  handle('lcu:getState', () => connection.state())
  handle('lcu:debugLookup', (id) =>
    currentLcuApi ? currentLcuApi.debugLookup(id) : Promise.resolve("League isn't open.")
  )
  handle('settings:get', () => ({
    lockfilePath: settings.get().lockfilePath,
    region: settings.get().region
  }))
  handle('settings:setLockfilePath', (p) => settings.set({ lockfilePath: p }))
  handle('flags:list', () => store.flags())
  handle('flags:add', async ({ puuid, note }) => {
    const known =
      store.players().find((p) => p.puuid === puuid) ??
      tracker
        ?.current()
        .game?.players.filter((p) => p.puuid === puuid)
        .map((p) => ({
          puuid,
          gameName: p.gameName,
          tagLine: p.tagLine,
          region: null,
          lastSeenAt: new Date().toISOString()
        }))[0]
    return store.addFlag({ puuid, note }, known)
  })
  handle('flags:delete', (id) => store.deleteFlag(id))
  handle('players:list', () => store.players())
  handle('history:list', (count) =>
    currentLcuApi ? currentLcuApi.getMatchHistory(count ?? 20) : Promise.resolve([])
  )
  handle('players:resolve', async (id) => {
    if (!currentLcuApi) throw new Error("League isn't open. Open the client, then try again.")
    const resolver = createResolver({
      history: () => currentLcuApi!.getMatchHistory(20),
      searchOpgg,
      lookupAlias: (rid) => currentLcuApi!.lookupAlias(rid),
      region: settings.get().region
    })
    const hit = await resolver.resolve(id.gameName, id.tagLine)
    if (hit) await store.upsertPlayers([hit.record])
    return hit
  })
  handle('players:candidates', async (name) => {
    const resolver = createResolver({
      history: () => (currentLcuApi ? currentLcuApi.getMatchHistory(20) : Promise.resolve([])),
      searchOpgg,
      lookupAlias: (rid) =>
        currentLcuApi ? currentLcuApi.lookupAlias(rid) : Promise.resolve(null),
      region: settings.get().region
    })
    return resolver.candidates(name)
  })
  handle('settings:setRegion', (r) => settings.set({ region: r.trim().toLowerCase() || 'oce' }))
  handle('players:lookup', async (id) => {
    if (!currentLcuApi) throw new Error("League isn't open. Open the client, then try again.")
    const rec =
      (await currentLcuApi.lookupAlias(id)) ??
      (id.tagLine ? null : await currentLcuApi.lookupByName(id.gameName))
    if (rec) await store.upsertPlayers([rec])
    return rec
  })
  handle('auth:signIn', () => auth.signIn())
  handle('auth:signOut', () => auth.signOut())
  handle('auth:get', () => auth.current())
  handle('crew:get', () => store.crew())
  handle('crew:create', (name) => store.createCrew(name))
  handle('crew:join', (code) => store.joinCrew(code))
  handle('sync:status', () => store.status())

  createWindow()
  tray = new AppTray(() => win?.show())
  connection.start()
  void auth.start().then(() => store.start())

  // Auto-update from GitHub Releases: check at launch and every 4h while sitting in the tray.
  // Downloads in the background, notifies, installs on quit. macOS needs a signed build for this.
  if (!is.dev) {
    autoUpdater.autoDownload = true
    autoUpdater.on('error', (e) => console.warn('[updater]', e.message))
    const check = (): void => void autoUpdater.checkForUpdatesAndNotify().catch(() => {})
    check()
    setInterval(check, 4 * 60 * 60 * 1000)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else win?.show()
  })
})

app.on('window-all-closed', () => {
  /* keep running in the tray */
})
