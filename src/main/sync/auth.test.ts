import { describe, it, expect } from 'vitest'
import { parseCallbackUrl, toAuthUser } from './auth'

describe('parseCallbackUrl', () => {
  it('extracts the code', () => {
    expect(parseCallbackUrl('/callback?code=abc123')).toEqual({ code: 'abc123' })
  })
  it('surfaces provider errors', () => {
    expect(parseCallbackUrl('/callback?error=access_denied&error_description=nope')).toEqual({
      error: 'nope'
    })
  })
  it('rejects missing code', () => {
    expect(parseCallbackUrl('/callback')).toEqual({ error: 'missing code' })
  })
})

describe('toAuthUser', () => {
  it('prefers discord global_name, then full_name', () => {
    const u = {
      id: 'u1',
      user_metadata: { full_name: 'Blake', custom_claims: { global_name: 'blakey' } }
    }
    expect(toAuthUser(u as never)).toEqual({ id: 'u1', discordName: 'blakey' })
    expect(toAuthUser({ id: 'u2', user_metadata: { full_name: 'B' } } as never)).toEqual({
      id: 'u2',
      discordName: 'B'
    })
  })
})
