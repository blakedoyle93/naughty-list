import { useState } from 'react'
import type { CurrentGame as Game, Hit, LcuState, Player } from '@shared/types'

interface Props {
  game: Game | null
  hits: Hit[]
  lcu: LcuState
  onFlag: (puuid: string, note: string) => Promise<void>
}

export function CurrentGame({ game, hits, lcu, onFlag }: Props): React.JSX.Element {
  if (lcu === 'disconnected') {
    return (
      <Empty
        title="League client not detected"
        body="Open the League client and this will connect automatically."
      />
    )
  }
  if (!game) {
    return (
      <Empty
        title="Not in a game"
        body="Queue up. Flagged players show here from champ select onward."
      />
    )
  }

  const hitFor = (p: Player): Hit | undefined =>
    hits.find((h) => h.player.puuid && h.player.puuid === p.puuid)
  const canFlag = game.phase === 'EndOfGame'
  const allies = game.players.filter((p) => p.team === 'ally')
  const enemies = game.players.filter((p) => p.team === 'enemy')

  return (
    <div className="space-y-6">
      <div className="text-sm text-zinc-400">
        Phase: <span className="text-zinc-100">{game.phase}</span>
      </div>
      <TeamList
        title="Your team"
        players={allies}
        hitFor={hitFor}
        canFlag={canFlag}
        onFlag={onFlag}
      />
      {game.enemiesHidden ? (
        <p className="text-sm text-zinc-500 italic">Enemies hidden by Riot until loading screen.</p>
      ) : (
        <TeamList
          title="Enemy team"
          players={enemies}
          hitFor={hitFor}
          canFlag={canFlag}
          onFlag={onFlag}
        />
      )}
    </div>
  )
}

function Empty({ title, body }: { title: string; body: string }): React.JSX.Element {
  return (
    <div className="rounded-lg border border-zinc-800 p-8 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-zinc-400">{body}</p>
    </div>
  )
}

function TeamList(props: {
  title: string
  players: Player[]
  hitFor: (p: Player) => Hit | undefined
  canFlag: boolean
  onFlag: Props['onFlag']
}): React.JSX.Element {
  return (
    <section>
      <h3 className="mb-2 text-xs uppercase tracking-wide text-zinc-500">{props.title}</h3>
      <ul className="space-y-2">
        {props.players.map((p, i) => (
          <PlayerRow
            key={p.puuid ?? `${p.gameName}-${i}`}
            player={p}
            hit={props.hitFor(p)}
            canFlag={props.canFlag}
            onFlag={props.onFlag}
          />
        ))}
      </ul>
    </section>
  )
}

function PlayerRow({
  player,
  hit,
  canFlag,
  onFlag
}: {
  player: Player
  hit?: Hit
  canFlag: boolean
  onFlag: Props['onFlag']
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const name = player.gameName ? `${player.gameName}#${player.tagLine}` : 'Hidden player'

  return (
    <li
      className={`rounded-md border p-3 ${hit ? 'border-red-600 bg-red-950/40' : 'border-zinc-800'}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium">
            {hit ? '⚠ ' : ''}
            {name}
          </div>
          {player.championName && (
            <div className="text-xs text-zinc-500">{player.championName}</div>
          )}
        </div>
        {canFlag && player.puuid && (
          <button
            className="rounded bg-zinc-800 px-3 py-1 text-sm hover:bg-zinc-700"
            onClick={() => setOpen((v) => !v)}
          >
            Flag
          </button>
        )}
      </div>
      {hit && (
        <ul className="mt-2 space-y-1 text-sm">
          {hit.flags.map((f) => (
            <li key={f.id}>
              <span className="text-red-300">{f.note}</span>{' '}
              <span className="text-zinc-500">· {f.createdByName}</span>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!player.puuid || !note.trim()) return
            setSaving(true)
            try {
              await onFlag(player.puuid, note.trim())
              setNote('')
              setOpen(false)
            } finally {
              setSaving(false)
            }
          }}
        >
          <input
            className="flex-1 rounded bg-zinc-900 px-2 py-1 text-sm"
            placeholder="What did they do?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
          />
          <button
            className="rounded bg-red-700 px-3 py-1 text-sm disabled:opacity-50"
            disabled={saving || !note.trim()}
          >
            Save
          </button>
        </form>
      )}
    </li>
  )
}
