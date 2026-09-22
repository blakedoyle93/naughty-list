/** A Postgrest error object, which is not an Error and so crosses IPC as "[object Object]". */
interface DbError {
  message?: string
  details?: string
  hint?: string
  code?: string
}

const MISSING_COLUMN = new Set(['42703', 'PGRST204'])
const MISSING_TABLE = new Set(['42P01', 'PGRST205'])
const NOT_ALLOWED = new Set(['42501'])

/**
 * Turn whatever Supabase threw into an Error with a sentence a person can act
 * on. Electron only serialises real Errors across IPC, so anything else
 * reaches the renderer as "[object Object]".
 */
export function toReadableError(e: unknown, what: string): Error {
  if (e instanceof Error) return e
  const db = (e ?? {}) as DbError
  const code = db.code ?? ''

  if (MISSING_COLUMN.has(code) || MISSING_TABLE.has(code)) {
    return new Error(
      `The database is missing part of this feature. Run the migrations against your Supabase project, then try again. (${what}: ${db.message ?? code})`
    )
  }
  if (NOT_ALLOWED.has(code)) {
    return new Error(`You're not allowed to do that. Only the person who made the crew can.`)
  }
  const parts = [db.message, db.details, db.hint].filter(Boolean)
  return new Error(parts.length ? parts.join(' — ') : `${what} failed: ${String(e)}`)
}
