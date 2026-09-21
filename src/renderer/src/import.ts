export interface ImportEntry {
  gameName: string
  tagLine: string
  note: string
}

const LINE = /^(.+?)(?:#([^\s#]+?))?\s*(?:(?:\s[-–]\s*|:\s*)(.*))?$/

/**
 * One player per line: `GameName#TAG - what they did`. The note is optional; so is the
 * tag when `defaultTag` is given (most people never change theirs, e.g. `OCE`).
 */
/** `"saying ez"` → `saying ez`. Quotes inside the note stay. */
function stripQuotes(s: string): string {
  return s
    .trim()
    .replace(/^["'“‘](.*)["'”’]$/, '$1')
    .trim()
}

export function parseImportLines(
  text: string,
  defaultTag = ''
): { entries: ImportEntry[]; bad: string[] } {
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
      tagLine: m[2] ?? defaultTag.trim().replace(/^#/, ''),
      note: stripQuotes(m[3] ?? '') || 'no reason given'
    })
  }
  return { entries, bad }
}
