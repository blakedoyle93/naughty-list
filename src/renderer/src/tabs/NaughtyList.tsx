import { useMemo, useState } from 'react'
import type { Flag } from '@shared/types'
import { usePlayers } from '../hooks/usePlayers'
import { Scribble } from '../components/Scribble'
import { parseImportLines } from '../import'

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
  const [bulk, setBulk] = useState('')
  const [bulkResult, setBulkResult] = useState<{ added: number; missed: string[] } | null>(null)

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
      setErr('Write it like GameName#TAG, with the hashtag.')
      return
    }
    setBusy(true)
    try {
      const rec = await lookup({ gameName: m[1], tagLine: m[2] })
      if (!rec) {
        setErr("Can't find that player. League has to be open to look people up.")
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

  async function importBulk(): Promise<void> {
    const { entries, bad } = parseImportLines(bulk)
    setBusy(true)
    setBulkResult(null)
    const missed = bad.map((l) => `${l} (needs a #TAG)`)
    let added = 0
    try {
      for (const e of entries) {
        const rec = await lookup({ gameName: e.gameName, tagLine: e.tagLine })
        if (!rec) {
          missed.push(`${e.gameName}#${e.tagLine}`)
          continue
        }
        await onAdd(rec.puuid, e.note)
        added++
      }
      setBulkResult({ added, missed })
      if (missed.length === 0) setBulk('')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <form
        onSubmit={submit}
        className="scrap max-w-xl"
        style={{ '--tilt': '-0.7deg' } as React.CSSProperties}
      >
        <h2 className="hand text-2xl leading-tight">Tell on someone</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            className="pencil-input min-w-44 flex-1"
            placeholder="GameName#TAG"
            value={riotId}
            onChange={(e) => setRiotId(e.target.value)}
          />
          <input
            className="pencil-input min-w-60 flex-[2]"
            placeholder="What did they do?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
          />
          <button
            className="crayon-btn"
            style={
              { '--btn-color': 'var(--color-crayon-red)', color: '#fff' } as React.CSSProperties
            }
            disabled={busy || !riotId.trim() || !note.trim()}
          >
            Add to list
          </button>
        </div>
        {err && <p className="hand mt-2 text-crayon-red">{err}</p>}
        <details className="mt-3">
          <summary className="link-btn">Got a whole list? Paste it here</summary>
          <p className="note-by mt-2">
            One per line: <code>GameName#TAG - what they did</code>. League has to be open.
          </p>
          <textarea
            className="pencil-input mt-2 w-full"
            rows={6}
            placeholder={'fockoff#OCE - bullied blake\nT1 T1 T1#OCE - AP rakan'}
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
          />
          <button
            type="button"
            className="crayon-btn mt-2"
            style={
              { '--btn-color': 'var(--color-crayon-red)', color: '#fff' } as React.CSSProperties
            }
            disabled={busy || !bulk.trim()}
            onClick={() => void importBulk()}
          >
            {busy ? 'Adding…' : 'Add them all'}
          </button>
          {bulkResult && (
            <div className="hand mt-2">
              <p>Added {bulkResult.added}.</p>
              {bulkResult.missed.length > 0 && (
                <p className="text-crayon-red">
                  Couldn&apos;t find: {bulkResult.missed.join(', ')}. Check the tag and try those
                  again.
                </p>
              )}
            </div>
          )}
        </details>
      </form>

      <div className="row mt-6">
        <input
          className="pencil-input w-full"
          placeholder="Search names or notes"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {grouped.length === 0 && (
        <p className="scratched mt-2">
          {flags.length === 0
            ? "Nobody's on the list yet. Everyone has been good. Suspicious."
            : 'No one matches that.'}
        </p>
      )}
      <ul className="mt-2">
        {grouped.map((row) => (
          <li key={row.puuid}>
            <div className="row">
              <span className="row-name is-naughty">
                <Scribble />
                {row.name}
              </span>
            </div>
            {row.flags.map((f) => (
              <div key={f.id} className="row pl-8">
                <span className="note">
                  “{f.note}”{' '}
                  <span className="note-by">
                    says {f.createdByName}, {new Date(f.createdAt).toLocaleDateString()}
                  </span>
                </span>
                {f.createdBy === userId && (
                  <button
                    aria-label={`Forgive: ${f.note}`}
                    className="link-btn ml-auto"
                    onClick={() => void onRemove(f.id)}
                  >
                    forgive
                  </button>
                )}
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  )
}
