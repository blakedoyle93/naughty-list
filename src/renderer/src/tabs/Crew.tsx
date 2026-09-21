import { useEffect, useState } from 'react'
import type { Crew as CrewT, CrewMember, SyncStatus } from '@shared/types'
import { api } from '../api'
import type { AuthState } from '../hooks/useAuth'

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
      <div className="rounded-lg border border-zinc-800 p-8 text-center">
        <p className="mb-4 text-sm text-zinc-400">Sign in so your flags sync with your crew.</p>
        <button
          className="rounded bg-indigo-600 px-4 py-2 text-sm disabled:opacity-50"
          disabled={auth.loading}
          onClick={() => void auth.signIn()}
        >
          Sign in with Discord
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between text-sm">
        <span>
          Signed in as <b>{auth.user.discordName}</b>
        </span>
        <button className="text-zinc-400 hover:text-zinc-100" onClick={() => void auth.signOut()}>
          Sign out
        </button>
      </div>

      {crew ? (
        <section className="rounded-lg border border-zinc-800 p-4">
          <h2 className="font-semibold">{crew.crew.name}</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Invite code:{' '}
            <code className="rounded bg-zinc-900 px-2 py-0.5">{crew.crew.inviteCode}</code>
            <button
              className="ml-2 text-xs text-indigo-400"
              onClick={() => void navigator.clipboard.writeText(crew.crew.inviteCode)}
            >
              copy
            </button>
          </p>
          <ul className="mt-3 text-sm">
            {crew.members.map((m) => (
              <li key={m.userId}>{m.discordName}</li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2">
          <form
            className="rounded-lg border border-zinc-800 p-4"
            onSubmit={(e) => {
              e.preventDefault()
              void run(() => api.invoke('crew:join', code.trim()))
            }}
          >
            <h2 className="mb-2 font-semibold">Join a crew</h2>
            <input
              className="w-full rounded bg-zinc-900 px-2 py-1 text-sm"
              placeholder="Invite code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <button
              className="mt-2 rounded bg-indigo-600 px-3 py-1 text-sm disabled:opacity-50"
              disabled={!code.trim()}
            >
              Join
            </button>
          </form>
          <form
            className="rounded-lg border border-zinc-800 p-4"
            onSubmit={(e) => {
              e.preventDefault()
              void run(() => api.invoke('crew:create', name.trim()))
            }}
          >
            <h2 className="mb-2 font-semibold">Create a crew</h2>
            <input
              className="w-full rounded bg-zinc-900 px-2 py-1 text-sm"
              placeholder="Crew name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
            />
            <button
              className="mt-2 rounded bg-zinc-700 px-3 py-1 text-sm disabled:opacity-50"
              disabled={!name.trim()}
            >
              Create
            </button>
          </form>
        </section>
      )}
      {err && <p className="text-sm text-red-400">{err}</p>}

      <section className="text-xs text-zinc-500">
        Sync: {sync?.online ? 'online' : 'offline (using cached list)'}
        {sync?.pendingWrites ? `, ${sync.pendingWrites} pending` : ''}
      </section>

      <section className="rounded-lg border border-zinc-800 p-4">
        <h2 className="mb-1 text-sm font-semibold">League lockfile path (advanced)</h2>
        <p className="mb-2 text-xs text-zinc-500">Leave empty for the default install location.</p>
        <input
          className="w-full rounded bg-zinc-900 px-2 py-1 text-sm"
          value={lockfile}
          placeholder="default"
          onChange={(e) => setLockfile(e.target.value)}
          onBlur={() => void api.invoke('settings:setLockfilePath', lockfile.trim() || null)}
        />
      </section>
    </div>
  )
}
