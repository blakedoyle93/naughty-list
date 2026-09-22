import { BrowserWindow, screen } from 'electron'
import type { CurrentGame, Hit } from '@shared/types'

/** Phases where the League client or the game itself is on screen and the overlay is useful. */
const OVERLAY_PHASES = new Set(['ChampSelect', 'GameStart', 'InProgress', 'Reconnect'])

/**
 * Pure so it can be tested without Electron. The overlay only ever appears when
 * there is something to say: a flagged player in a game that is actually running.
 */
export function shouldShowOverlay(
  game: CurrentGame | null,
  hits: Hit[],
  enabled: boolean
): boolean {
  if (!enabled || !game || hits.length === 0) return false
  return OVERLAY_PHASES.has(game.phase)
}

const WIDTH = 340
const MARGIN = 24

export class Overlay {
  private win: BrowserWindow | null = null
  private enabled = true
  private last: { game: CurrentGame | null; hits: Hit[] } = { game: null, hits: [] }

  constructor(
    private readonly opts: {
      preload: string
      /** dev server URL, or null in production */
      rendererUrl: string | null
      indexHtml: string
      log: (message: string, data?: unknown) => void
    }
  ) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    this.apply()
  }

  update(game: CurrentGame | null, hits: Hit[]): void {
    this.last = { game, hits }
    this.apply()
    // push() already broadcasts game:update to every window, including this one.
  }

  destroy(): void {
    this.win?.destroy()
    this.win = null
  }

  private apply(): void {
    const want = shouldShowOverlay(this.last.game, this.last.hits, this.enabled)
    if (!want) {
      if (this.win?.isVisible()) {
        this.opts.log('overlay hidden')
        this.win.hide()
      }
      return
    }
    const win = this.ensure()
    if (!win.isVisible()) {
      this.opts.log('overlay shown', { hits: this.last.hits.length })
      win.showInactive()
    }
    win.setAlwaysOnTop(true, 'screen-saver')
  }

  private ensure(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win
    const { workArea } = screen.getPrimaryDisplay()
    const win = new BrowserWindow({
      width: WIDTH,
      height: 260,
      x: workArea.x + workArea.width - WIDTH - MARGIN,
      y: workArea.y + MARGIN,
      show: false,
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: false,
      acceptFirstMouse: false,
      webPreferences: {
        preload: this.opts.preload,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    // Clicks fall through to League: the overlay is a label, never a target.
    win.setIgnoreMouseEvents(true, { forward: true })
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    win.setAlwaysOnTop(true, 'screen-saver')
    win.on('closed', () => {
      this.win = null
    })
    win.webContents.on('did-finish-load', () => {
      win.webContents.send('game:update', this.last)
    })
    if (this.opts.rendererUrl) void win.loadURL(`${this.opts.rendererUrl}#overlay`)
    else void win.loadFile(this.opts.indexHtml, { hash: 'overlay' })
    this.win = win
    return win
  }
}
