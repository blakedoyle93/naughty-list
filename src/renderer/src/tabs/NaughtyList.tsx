import { useMemo, useState } from 'react'
import type { Flag } from '@shared/types'
import { usePlayers } from '../hooks/usePlayers'
import { api } from '../api'
import { Scribble } from '../components/Scribble'
import { parseImportLines } from '../import'

interface Props {
  flags: Flag[]
  onAdd: (puuid: string, note: string) => Promise<void>
  onRemove: (id: string) => Promise<void>
  userId: string | null
}

export function NaughtyList({ flags, onAdd, onRemove, userId }: Props): React.JSX.Element {
  const { players } = usePlayers(flags.length)
  const [q, setQ] = useState('')
  const [gameName, setGameName] = useState('')
  const [tag, setTag] = useState(() => {
    try {
      return localStorage.getItem('lastTag') ?? 'OCE'
    } catch {
      return 'OCE'
    }
  })
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [bulk, setBulk] = useState('')
  const [bulkResult, setBulkResult] = useState<{ added: number; missed: string[] } | null>(null)
  const [foundVia, setFoundVia] = useState<string | null>(null)

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

  /** Pasting "Name#TAG" into the name box splits it across both fields. */
  function onNameChange(v: string): void {
    const m = v.match(/^(.+?)#(\S+)$/)
    if (m) {
      setGameName(m[1].trim())
      setTag(m[2])
    } else {
      setGameName(v)
    }
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setErr(null)
    const name = gameName.trim()
    const tagLine = tag.trim().replace(/^#/, '')
    if (!name) return
    setBusy(true)
    try {
      const hit = await api.invoke('players:resolve', { gameName: name, tagLine })
      if (!hit) {
        setErr(
          `Can't find ${name}${tagLine ? `#${tagLine}` : ''}. Check the spelling, or add the tag.`
        )
        return
      }
      try {
        localStorage.setItem('lastTag', hit.record.tagLine)
      } catch {
        /* private window etc. */
      }
      await onAdd(hit.record.puuid, note.trim())
      setFoundVia(
        hit.source === 'given'
          ? null
          : `Found ${hit.record.gameName}#${hit.record.tagLine} ${
              hit.source === 'history' ? 'in your match history' : 'on op.gg'
            }.`
      )
      setGameName('')
      setNote('')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function importBulk(): Promise<void> {
    const { entries, bad } = parseImportLines(bulk, tag)
    setBusy(true)
    setBulkResult(null)
    const missed = bad.map((l) => `${l} (needs a #TAG)`)
    let added = 0
    try {
      for (const e of entries) {
        const hit = await api.invoke('players:resolve', {
          gameName: e.gameName,
          tagLine: e.tagLine
        })
        const rec = hit?.record ?? null
        if (!rec) {
          missed.push(e.tagLine ? `${e.gameName}#${e.tagLine}` : e.gameName)
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
          <span className="riot-id">
            <input
              className="pencil-input"
              placeholder="Game name"
              aria-label="Game name"
              value={gameName}
              onChange={(e) => onNameChange(e.target.value)}
            />
            <span className="riot-id-hash" aria-hidden="true">
              #
            </span>
            <input
              className="pencil-input riot-id-tag"
              placeholder="TAG"
              aria-label="Tag"
              value={tag}
              onChange={(e) => setTag(e.target.value.replace(/^#/, ''))}
              maxLength={5}
            />
          </span>
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
            disabled={busy || !gameName.trim() || !note.trim()}
          >
            Add to list
          </button>
        </div>
        {err && <p className="hand mt-2 text-crayon-red">{err}</p>}
        {foundVia && <p className="note mt-2">{foundVia}</p>}
        <details className="mt-3">
          <summary className="link-btn">Got a whole list? Paste it here</summary>
          <p className="note-by mt-2">
            One per line: <code>GameName#TAG - what they did</code>. League has to be open. The tag
            is optional: we try the one below, then a plain name search.
          </p>
          <label className="row mt-2">
            <span className="note">No tag? Try</span>
            <input
              className="pencil-input w-24"
              aria-label="Default tag"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            />
          </label>
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
