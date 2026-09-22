import { appendFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'

const MAX_LINES = 500
const SECRETS = [/Basic\s+[A-Za-z0-9+/=]+/g, /"?(access|refresh)_token"?\s*[:=]\s*"?[\w.-]+/gi]

/** In-memory tail plus an append-only file, so a friend can copy their log without finding it. */
export class Logger {
  private lines: string[] = []

  constructor(private readonly filePath: string | null = null) {}

  log(tag: string, message: string, data?: unknown): void {
    const extra = data === undefined ? '' : ` ${safeJson(data)}`
    const line = redact(`${new Date().toISOString()} [${tag}] ${message}${extra}`)
    this.lines.push(line)
    if (this.lines.length > MAX_LINES) this.lines = this.lines.slice(-MAX_LINES)
    console.log(line)
    if (!this.filePath) return
    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
      appendFileSync(this.filePath, line + '\n')
    } catch {
      /* logging must never break the app */
    }
  }

  tail(count = 200): string[] {
    return this.lines.slice(-count)
  }
}

function safeJson(data: unknown): string {
  try {
    return typeof data === 'string' ? data : JSON.stringify(data)
  } catch {
    return String(data)
  }
}

/** The LCU password and Supabase tokens must never reach a pasted log. */
function redact(line: string): string {
  return SECRETS.reduce(
    (acc, re) => acc.replace(re, (m) => m.split(/[\s:=]/)[0] + ' <redacted>'),
    line
  )
}
