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
  return {
    processName,
    pid: pidN,
    port: portN,
    password,
    protocol: protocol === 'http' ? 'http' : 'https'
  }
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
  const candidates = opts.override
    ? [opts.override]
    : defaultLockfilePaths(opts.platform ?? process.platform)
  for (const p of candidates) {
    try {
      return parseLockfile(readFile(p))
    } catch {
      /* try next */
    }
  }
  return null
}
