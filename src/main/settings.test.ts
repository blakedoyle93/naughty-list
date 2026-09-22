import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { SettingsStore } from './settings'

describe('SettingsStore', () => {
  it('defaults, persists, reloads', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'nl-')), 'settings.json')
    const a = new SettingsStore(file)
    expect(a.get()).toEqual({ lockfilePath: null, region: 'oce' })
    a.set({ lockfilePath: '/x/lockfile' })
    expect(new SettingsStore(file).get().lockfilePath).toBe('/x/lockfile')
  })
})
