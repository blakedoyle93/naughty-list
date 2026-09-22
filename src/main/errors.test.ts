import { describe, it, expect } from 'vitest'
import { toReadableError } from './errors'

describe('toReadableError', () => {
  it('passes a real Error straight through', () => {
    const e = new Error('join or create a crew first')
    expect(toReadableError(e, 'save')).toBe(e)
  })

  it('tells you to run the migrations when a column or table is missing', () => {
    for (const code of ['42703', 'PGRST204', '42P01', 'PGRST205']) {
      const msg = toReadableError({ code, message: 'no such column' }, 'save the webhook').message
      expect(msg).toContain('Run the migrations')
      expect(msg).toContain('save the webhook')
    }
  })

  it('explains a row-level security refusal in plain words', () => {
    expect(toReadableError({ code: '42501' }, 'save').message).toContain(
      'Only the person who made the crew'
    )
  })

  it('joins message, details and hint for anything else', () => {
    expect(
      toReadableError({ message: 'nope', details: 'because', hint: 'try x' }, 'save').message
    ).toBe('nope — because — try x')
  })

  it('never returns the useless object form', () => {
    expect(toReadableError({}, 'save the webhook').message).toContain('save the webhook failed')
    expect(toReadableError(null, 'save').message).not.toBe('[object Object]')
  })
})
