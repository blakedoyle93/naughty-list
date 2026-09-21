import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { parseLockfile, defaultLockfilePaths, readLockfile } from './lockfile'

const fixture = readFileSync('test/fixtures/lockfile.txt', 'utf8')

describe('parseLockfile', () => {
  it('parses the five colon-separated fields', () => {
    expect(parseLockfile(fixture)).toEqual({
      processName: 'LeagueClientUx',
      pid: 12345,
      port: 54321,
      password: 'AbCdEfGhIjKlMnOpQrStUv',
      protocol: 'https'
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
    expect(readLockfile({ override: '/custom/lockfile', platform: 'darwin', readFile })?.port).toBe(
      54321
    )
  })
  it('falls back to defaults and returns null when nothing exists', () => {
    const readFile = (): string => {
      throw new Error('ENOENT')
    }
    expect(readLockfile({ override: null, platform: 'darwin', readFile })).toBeNull()
  })
})
