import { useEffect, useState } from 'react'
import type { Flag, PastGame, Player } from '@shared/types'
import { api } from '../api'
import { Scribble } from '../components/Scribble'

interface Props {
  flags: Flag[]
  onAdd: (puuid: string, note: string) => Promise<void>
}

export function RecentGames({ flags, onAdd }: Props): React.JSX.Element {
  const [games, setGames] = useState<PastGame[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [writing, setWriting] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const flagged = new Set(flags.map((f) => f.puuid))

  useEffect(() => {
    let cancelled = false
    void api.invoke('history:list', 20).then((g) => {
      if (!cancelled) setGames(g)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (games === null) return <p className="note mt-2">Reading your match history…</p>
  if (games.length === 0) {
    return (
      <div className="scrap mt-4 max-w-md">
        <h2 className="hand text-2xl leading-tight">No games to show</h2>
        <p className="mt-2 text-ink-soft">
          Open League and play a game, or check the League client is signed in. Your match history
          comes straight from the client.
        </p>
      </div>
    )
  }

  return (
    <div>
      <p className="note-by">Your last {games.length} games. Tap a game to see everyone in it.</p>
      <ul className="mt-2">
        {games.map((g) => (
          <li key={g.gameId}>
            <button
              className="row w-full text-left"
              aria-expanded={open === g.gameId}
              onClick={() => setOpen(open === g.gameId ? null : g.gameId)}
            >
              <span className="row-name">{g.queue}</span>
              <span className="note-by">
                {g.win === null ? '' : g.win ? 'won' : 'lost'}
                {g.playedAt ? ` · ${new Date(g.playedAt).toLocaleDateString()}` : ''}
              </span>
              <span className="link-btn">{open === g.gameId ? 'hide' : 'who played'}</span>
            </button>
            {open === g.gameId && (
              <div className="pl-6">
                {(['ally', 'enemy'] as const).map((team) => (
                  <div key={team}>
                    <h3 className="section-heading mt-2">{team === 'ally' ? 'Us' : 'Them'}</h3>
                    {g.players
                      .filter((p) => p.team === team)
                      .map((p) => (
                        <PlayerRow
                          key={`${p.puuid ?? p.gameName}`}
                          player={p}
                          naughty={!!p.puuid && flagged.has(p.puuid)}
                          writing={writing === `${g.gameId}:${p.puuid}`}
                          note={note}
                          setNote={setNote}
                          onStart={() => {
                            setWriting(`${g.gameId}:${p.puuid}`)
                            setNote('')
                          }}
                          onCancel={() => setWriting(null)}
                          onSave={async () => {
                            if (!p.puuid || !note.trim()) return
                            await onAdd(p.puuid, note.trim())
                            setWriting(null)
                            setNote('')
                          }}
                        />
                      ))}
                  </div>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

interface RowProps {
  player: Player
  naughty: boolean
  writing: boolean
  note: string
  setNote: (v: string) => void
  onStart: () => void
  onCancel: () => void
  onSave: () => Promise<void>
}

function PlayerRow({
  player,
  naughty,
  writing,
  note,
  setNote,
  onStart,
  onCancel,
  onSave
}: RowProps): React.JSX.Element {
  const name = player.tagLine ? `${player.gameName}#${player.tagLine}` : player.gameName
  return (
    <div>
      <div className="row">
        <span className={naughty ? 'row-name is-naughty' : 'row-name'}>
          {naughty && <Scribble />}
          {name}
        </span>
        {naughty && <span className="note-by">already on the list</span>}
        {player.puuid && (
          <button
            className="link-btn ml-auto"
            aria-label={naughty ? `Add your note about ${name}` : `Tell on ${name}`}
            onClick={onStart}
          >
            {naughty ? 'add your note' : 'tell on them'}
          </button>
        )}
      </div>
      {writing && (
        <form
          className="row pl-6"
          onSubmit={(e) => {
            e.preventDefault()
            void onSave()
          }}
        >
          <input
            className="pencil-input flex-1"
            placeholder="What did they do?"
            aria-label={`What did ${name} do?`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            autoFocus
          />
          <button
            className="crayon-btn"
            style={
              { '--btn-color': 'var(--color-crayon-red)', color: '#fff' } as React.CSSProperties
            }
            disabled={!note.trim()}
          >
            Add to list
          </button>
          <button type="button" className="link-btn" onClick={onCancel}>
            never mind
          </button>
        </form>
      )}
    </div>
  )
}
