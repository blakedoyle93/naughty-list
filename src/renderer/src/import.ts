export interface ImportEntry {
  gameName: string
  tagLine: string
  note: string
}

const LINE = /^(.+?)#([^\s\-–:]+)\s*(?:[-–:]\s*(.*))?$/

/** One player per line: `GameName#TAG - what they did`. The note is optional. */
export function parseImportLines(text: string): { entries: ImportEntry[]; bad: string[] } {
  const entries: ImportEntry[] = []
  const bad: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const m = line.match(LINE)
    if (!m) {
      bad.push(line)
      continue
    }
    entries.push({
      gameName: m[1].trim(),
      tagLine: m[2],
      note: (m[3] ?? '').trim() || 'no reason given'
    })
  }
  return { entries, bad }
}
