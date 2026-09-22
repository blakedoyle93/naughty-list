import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { Logger } from './log'

describe('Logger', () => {
  it('keeps a tail, appends to file and serialises data', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'nl-log-')), 'sub', 'main.log')
    const log = new Logger(file)
    log.log('lcu', 'connected', { port: 1234 })
    log.log('game', 'phase', 'InProgress')
    expect(log.tail()).toHaveLength(2)
    expect(log.tail(1)[0]).toContain('[game] phase InProgress')
    expect(readFileSync(file, 'utf8')).toContain('[lcu] connected {"port":1234}')
  })

  it('redacts the LCU password and auth tokens', () => {
    const log = new Logger(null)
    log.log('lcu', 'auth header Basic cmlvdDpzM2NyZXQ=')
    log.log('auth', 'session', { access_token: 'ey.Jabc-def' })
    expect(log.tail().join('\n')).not.toContain('cmlvdDpzM2NyZXQ=')
    expect(log.tail().join('\n')).not.toContain('ey.Jabc-def')
    expect(log.tail(1)[0]).toContain('<redacted>')
  })

  it('caps the tail at 500 lines', () => {
    const log = new Logger(null)
    for (let i = 0; i < 600; i++) log.log('x', `line ${i}`)
    expect(log.tail(1000)).toHaveLength(500)
    expect(log.tail(1)[0]).toContain('line 599')
  })
})
