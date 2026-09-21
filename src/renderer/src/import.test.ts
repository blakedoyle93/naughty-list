import { describe, it, expect } from 'vitest'
import { parseImportLines } from './import'

describe('parseImportLines', () => {
  it('parses "Name#TAG - note" lines, skipping blanks', () => {
    const r = parseImportLines('fockoff#OCE - bullied blake\n\n  T1 T1 T1#OCE - AP rakan  \n')
    expect(r.entries).toEqual([
      { gameName: 'fockoff', tagLine: 'OCE', note: 'bullied blake' },
      { gameName: 'T1 T1 T1', tagLine: 'OCE', note: 'AP rakan' }
    ])
    expect(r.bad).toEqual([])
  })
  it('accepts en dash and colon separators and lines with no note', () => {
    const r = parseImportLines('a#1 – x\nb#2: y\njared#OCE')
    expect(r.entries.map((e) => e.note)).toEqual(['x', 'y', 'no reason given'])
  })
  it('leaves the tag empty when there is no default (name-only lookup)', () => {
    const r = parseImportLines('jared - no tag here')
    expect(r.entries).toEqual([{ gameName: 'jared', tagLine: '', note: 'no tag here' }])
    expect(r.bad).toEqual([])
  })
  it('fills in the default tag, keeping explicit ones', () => {
    const r = parseImportLines('T1 T1 T1 - AP rakan\nBens Cousins#NA1 - ks', '#OCE')
    expect(r.entries).toEqual([
      { gameName: 'T1 T1 T1', tagLine: 'OCE', note: 'AP rakan' },
      { gameName: 'Bens Cousins', tagLine: 'NA1', note: 'ks' }
    ])
  })
  it('strips quotes wrapped around a note', () => {
    const r = parseImportLines('JohnnySins69420 - "saying ez"\nkibryLemon - saying ‘ez’ a lot')
    expect(r.entries.map((e) => e.note)).toEqual(['saying ez', 'saying ‘ez’ a lot'])
  })
})
