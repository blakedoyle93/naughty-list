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
  it('reports lines without a tag', () => {
    const r = parseImportLines('jared - no tag here')
    expect(r.entries).toEqual([])
    expect(r.bad).toEqual(['jared - no tag here'])
  })
})
