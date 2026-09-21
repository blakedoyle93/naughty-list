import { useMemo, useState } from 'react'
import type { Flag } from '@shared/types'
import { usePlayers } from '../hooks/usePlayers'

interface Props {
  flags: Flag[]
  onAdd: (puuid: string, note: string) => Promise<void>
  onRemove: (id: string) => Promise<void>
  userId: string | null
}

export function NaughtyList({ flags, onAdd, onRemove, userId }: Props): React.JSX.Element {
  const { players, lookup } = usePlayers(flags.length)
  const [q, setQ] = useState('')
  const [riotId, setRiotId] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const grouped = useMemo(() => {
    const byPuuid = new Map<string, Flag[]>()
    for (const f of flags) byPuuid.set(f.puuid, [...(byPuuid.get(f.puuid) ?? []), f])
    const rows = [...byPuuid.entries()].map(([puuid, fs]) => {
      const p = players.find((x) => x.puuid === puuid)
      const name = p ? `${p.gameName}#${p.tagLine}` : puuid
      return { puuid, name, flags: fs }
    })
    const needle = q.trim().toLowerCase()
    return rows.filter(
      (r) =>
        !needle ||
        r.name.toLowerCase().includes(needle) ||
        r.flags.some((f) => f.note.toLowerCase().includes(needle))
    )
  }, [flags, players, q])

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setErr(null)
    const m = riotId.trim().match(/^(.+?)#(.+)$/)
    if (!m) {
      setErr('Use the format GameName#TAG')
      return
    }
    setBusy(true)
    try {
      const rec = await lookup({ gameName: m[1], tagLine: m[2] })
      if (!rec) {
        setErr('Player not found. Is the League client open?')
        return
      }
      await onAdd(rec.puuid, note.trim())
      setRiotId('')
      setNote('')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={submit}
        className="flex flex-wrap gap-2 rounded-lg border border-zinc-800 p-3"
      >
        <input
          className="min-w-40 flex-1 rounded bg-zinc-900 px-2 py-1 text-sm"
          placeholder="GameName#TAG"
          value={riotId}
          onChange={(e) => setRiotId(e.target.value)}
        />
        <input
          className="min-w-60 flex-[2] rounded bg-zinc-900 px-2 py-1 text-sm"
          placeholder="What did they do?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
        />
        <button
          className="rounded bg-red-700 px-3 py-1 text-sm disabled:opacity-50"
          disabled={busy || !riotId.trim() || !note.trim()}
        >
          Add
        </button>
        {err && <p className="w-full text-xs text-red-400">{err}</p>}
      </form>

      <input
        className="w-full rounded bg-zinc-900 px-3 py-2 text-sm"
        placeholder="Search players or notes"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {grouped.length === 0 && <p className="text-sm text-zinc-500">Nobody on the list yet.</p>}
      <ul className="space-y-3">
        {grouped.map((row) => (
          <li key={row.puuid} className="rounded-md border border-zinc-800 p-3">
            <div className="font-medium">{row.name}</div>
            <ul className="mt-2 space-y-1 text-sm">
              {row.flags.map((f) => (
                <li key={f.id} className="flex items-start justify-between gap-3">
                  <span>
                    <span className="text-red-300">{f.note}</span>{' '}
                    <span className="text-zinc-500">
                      · {f.createdByName} · {new Date(f.createdAt).toLocaleDateString()}
                    </span>
                  </span>
                  {f.createdBy === userId && (
                    <button
                      aria-label="Delete note"
                      className="text-xs text-zinc-500 hover:text-red-400"
                      onClick={() => void onRemove(f.id)}
                    >
                      Delete
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}
