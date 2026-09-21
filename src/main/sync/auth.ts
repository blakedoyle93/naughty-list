import { createServer } from 'http'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { AuthUser } from '@shared/types'

export function parseCallbackUrl(url: string): { code: string } | { error: string } {
  const u = new URL(url, 'http://localhost')
  const err = u.searchParams.get('error')
  if (err) return { error: u.searchParams.get('error_description') ?? err }
  const code = u.searchParams.get('code')
  return code ? { code } : { error: 'missing code' }
}

export function toAuthUser(u: User): AuthUser {
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>
  const custom = (meta.custom_claims ?? {}) as Record<string, unknown>
  const name =
    (custom.global_name as string) ||
    (meta.full_name as string) ||
    (meta.name as string) ||
    'unknown'
  return { id: u.id, discordName: name }
}

/**
 * Discord OAuth via PKCE. The system browser handles the login and redirects to a
 * one-shot loopback HTTP server on 127.0.0.1, which hands the code back to supabase-js.
 */
export class AuthService {
  private readonly port: number

  constructor(
    private readonly deps: {
      supabase: SupabaseClient
      openExternal: (url: string) => Promise<void>
      port?: number
      onChange: (u: AuthUser | null) => void
    }
  ) {
    this.port = deps.port ?? 53682
  }

  async start(): Promise<void> {
    this.deps.supabase.auth.onAuthStateChange((_evt, session) => {
      this.deps.onChange(session?.user ? toAuthUser(session.user) : null)
    })
    this.deps.onChange(await this.current())
  }

  async current(): Promise<AuthUser | null> {
    const { data } = await this.deps.supabase.auth.getSession()
    return data.session?.user ? toAuthUser(data.session.user) : null
  }

  async signOut(): Promise<void> {
    await this.deps.supabase.auth.signOut()
  }

  async signIn(): Promise<AuthUser> {
    const redirectTo = `http://localhost:${this.port}/callback`
    const codePromise = this.waitForCallback()
    const { data, error } = await this.deps.supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: { redirectTo, skipBrowserRedirect: true }
    })
    if (error || !data.url) throw error ?? new Error('no auth url')
    await this.deps.openExternal(data.url)
    const code = await codePromise
    const ex = await this.deps.supabase.auth.exchangeCodeForSession(code)
    if (ex.error || !ex.data.session) throw ex.error ?? new Error('no session')
    return toAuthUser(ex.data.session.user)
  }

  private waitForCallback(): Promise<string> {
    return new Promise((resolve, reject) => {
      const server = createServer((req, res) => {
        const parsed = parseCallbackUrl(req.url ?? '')
        res.setHeader('Content-Type', 'text/html')
        if ('code' in parsed) {
          res.end('<h2>Signed in. You can close this tab and go back to Naughty List.</h2>')
          server.close()
          resolve(parsed.code)
        } else {
          res.statusCode = 400
          res.end(`<h2>Sign-in failed: ${parsed.error}</h2>`)
          server.close()
          reject(new Error(parsed.error))
        }
      })
      server.on('error', reject)
      server.listen(this.port, '127.0.0.1')
      setTimeout(() => {
        server.close()
        reject(new Error('sign-in timed out'))
      }, 5 * 60_000).unref()
    })
  }
}
