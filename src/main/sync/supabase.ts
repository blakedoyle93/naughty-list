import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'

/** Tiny JSON-file key/value store so supabase-js can persist the session in userData. */
function fileStorage(file: string): {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
  removeItem(k: string): void
} {
  const load = (): Record<string, string> => {
    try {
      return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
    } catch {
      return {}
    }
  }
  const save = (d: Record<string, string>): void => {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(d))
  }
  return {
    getItem: (k) => load()[k] ?? null,
    setItem: (k, v) => {
      const d = load()
      d[k] = v
      save(d)
    },
    removeItem: (k) => {
      const d = load()
      delete d[k]
      save(d)
    }
  }
}

export function createSupabase(opts: {
  url: string
  anonKey: string
  storageFile: string
}): SupabaseClient {
  return createClient(opts.url, opts.anonKey, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: fileStorage(opts.storageFile)
    }
  })
}
