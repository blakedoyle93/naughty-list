import { useEffect, useState } from 'react'
import type { Crew as CrewT, CrewMember, SyncStatus } from '@shared/types'
import { api } from '../api'
import type { AuthState } from '../hooks/useAuth'
import { Sticker } from '../components/Sticker'

interface Props {
  auth: AuthState
}

export function Crew({ auth }: Props): React.JSX.Element {
  const [crew, setCrew] = useState<{ crew: CrewT; members: CrewMember[] } | null>(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [sync, setSync] = useState<SyncStatus | null>(null)
  const [lockfile, setLockfile] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const [probe, setProbe] = useState('')
  const [probeOut, setProbeOut] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = auth.user ? api.invoke('crew:get') : Promise.resolve(null)
    void load.then((c) => {
      if (!cancelled) setCrew(c)
    })
    return () => {
      cancelled = true
    }
  }, [auth.user])

  useEffect(() => {
    void api.invoke('sync:status').then(setSync)
    void api.invoke('settings:get').then((s) => setLockfile(s.lockfilePath ?? ''))
    return api.on('sync:status', setSync)
  }, [])

  async function run(fn: () => Promise<unknown>): Promise<void> {
    setErr(null)
    try {
      await fn()
      setCrew(await api.invoke('crew:get'))
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  if (!auth.user) {
    return (
      <div className="scrap mt-6 max-w-md">
        <h2 className="hand text-2xl leading-tight">Who are you?</h2>
        <p className="mt-2 text-ink-soft">
          Sign in with Discord so your list is shared with your friends and everyone can see who
          wrote what.
        </p>
        <button
          className="crayon-btn mt-4"
          style={
            { '--btn-color': 'var(--color-crayon-purple)', color: '#fff' } as React.CSSProperties
          }
          disabled={auth.loading}
          onClick={() => void auth.signIn()}
        >
          {auth.loading ? 'Waiting for Discord…' : 'Sign in with Discord'}
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="row">
        <span className="note">
          Hi, {auth.user.discordName}.{' '}
          <button className="link-btn" onClick={() => void auth.signOut()}>
            not you? sign out
          </button>
        </span>
      </div>

      {crew ? (
        <section className="mt-4">
          <h2 className="section-heading">{crew.crew.name}</h2>
          <div className="row">
            <span className="note">Secret code for friends:</span>
            <Sticker color="yellow" tilt={-3}>
              <span style={{ letterSpacing: '0.12em' }}>{crew.crew.inviteCode}</span>
            </Sticker>
            <button
              className="link-btn"
              onClick={() => {
                void navigator.clipboard.writeText(crew.crew.inviteCode)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
            >
              {copied ? 'copied!' : 'copy'}
            </button>
          </div>
          <h3 className="section-heading mt-4">Members</h3>
          <ul>
            {crew.members.map((m) => (
              <li key={m.userId} className="row">
                <span className="row-name">{m.discordName}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="mt-6 grid gap-6 sm:grid-cols-2">
          <form
            className="scrap"
            style={{ '--tilt': '-1deg' } as React.CSSProperties}
            onSubmit={(e) => {
              e.preventDefault()
              void run(() => api.invoke('crew:join', code.trim()))
            }}
          >
            <h2 className="hand text-2xl leading-tight">Got a secret code?</h2>
            <input
              className="pencil-input mt-3 w-full"
              placeholder="Invite code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <button
              className="crayon-btn mt-3"
              style={
                { '--btn-color': 'var(--color-crayon-blue)', color: '#fff' } as React.CSSProperties
              }
              disabled={!code.trim()}
            >
              Join
            </button>
          </form>
          <form
            className="scrap"
            style={{ '--tilt': '1.2deg' } as React.CSSProperties}
            onSubmit={(e) => {
              e.preventDefault()
              void run(() => api.invoke('crew:create', name.trim()))
            }}
          >
            <h2 className="hand text-2xl leading-tight">Start your own crew</h2>
            <input
              className="pencil-input mt-3 w-full"
              placeholder="Crew name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
            />
            <button className="crayon-btn mt-3" disabled={!name.trim()}>
              Create
            </button>
          </form>
        </section>
      )}
      {err && <p className="hand mt-3 text-crayon-red">{err}</p>}

      <p className="scratched mt-6">
        {sync?.online ? 'Synced with your crew.' : 'Offline. Using the last list we saved.'}
        {sync?.pendingWrites ? ` ${sync.pendingWrites} thing(s) waiting to send.` : ''}
      </p>

      <details className="mt-4">
        <summary className="link-btn">League installed somewhere weird?</summary>
        <div className="row mt-2">
          <input
            className="pencil-input w-full"
            value={lockfile}
            placeholder="Full path to the League lockfile (leave empty for the default)"
            onChange={(e) => setLockfile(e.target.value)}
            onBlur={() => void api.invoke('settings:setLockfilePath', lockfile.trim() || null)}
          />
        </div>
      </details>

      <details className="mt-2">
        <summary className="link-btn">Can&apos;t find someone who definitely exists?</summary>
        <p className="note-by mt-2">
          Type their Riot ID and we&apos;ll show exactly what League answers. Send that to Blake.
        </p>
        <form
          className="row mt-2"
          onSubmit={(e) => {
            e.preventDefault()
            const m = probe.trim().match(/^(.+?)#(.+)$/)
            if (!m) {
              setProbeOut('Write it like GameName#TAG.')
              return
            }
            setProbeOut('Asking League…')
            void api
              .invoke('lcu:debugLookup', { gameName: m[1].trim(), tagLine: m[2].trim() })
              .then(setProbeOut)
          }}
        >
          <input
            className="pencil-input flex-1"
            placeholder="GameName#TAG"
            aria-label="Riot ID to test"
            value={probe}
            onChange={(e) => setProbe(e.target.value)}
          />
          <button className="crayon-btn" disabled={!probe.trim()}>
            Test
          </button>
        </form>
        {probeOut && (
          <textarea
            readOnly
            className="pencil-input mt-2 w-full font-mono text-xs"
            rows={12}
            value={probeOut}
            onFocus={(e) => e.currentTarget.select()}
          />
        )}
      </details>
    </div>
  )
}
