import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'

export interface Settings {
  lockfilePath: string | null
  /** op.gg region slug used when searching for a tag we don't have. */
  region: string
  /** float a small panel over the client and the game when someone is flagged */
  overlayEnabled: boolean
}

const DEFAULTS: Settings = { lockfilePath: null, region: 'oce', overlayEnabled: true }

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
