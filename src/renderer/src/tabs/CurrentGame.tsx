import { useState } from 'react'
import type { CurrentGame as Game, Hit, LcuState, Player } from '@shared/types'
import { Scribble } from '../components/Scribble'
import { Sticker } from '../components/Sticker'

interface Props {
  game: Game | null
  hits: Hit[]
  lcu: LcuState
  onFlag: (puuid: string, note: string) => Promise<void>
}

const PHASE_WORDS: Record<string, string> = {
  ChampSelect: 'Picking champs',
  GameStart: 'Loading in',
  InProgress: 'Playing',
  WaitingForStats: 'Game over, waiting for the scoreboard',
  PreEndOfGame: 'Game over',
  EndOfGame: 'Scoreboard. Time to tell on people.',
  Reconnect: 'Reconnecting'
}

export function CurrentGame({ game, hits, lcu, onFlag }: Props): React.JSX.Element {
  if (lcu === 'disconnected') {
    return (
      <Scrap
        title="League isn't open"
        body="Open the League client. This page fills in by itself once you're in a game."
      />
    )
  }
  if (!game) {
    return (
      <Scrap
        title="Not in a game"
        body="Go queue up. Anyone on the list gets circled in red the moment we can see them."
      />
    )
  }

  const hitFor = (p: Player): Hit | undefined =>
    hits.find((h) => h.player.puuid && h.player.puuid === p.puuid)
  const canFlag = game.phase === 'EndOfGame'
  const allies = game.players.filter((p) => p.team === 'ally')
  const enemies = game.players.filter((p) => p.team === 'enemy')

  return (
    <div>
      <p className="scratched">{PHASE_WORDS[game.phase] ?? game.phase}</p>
      {hits.length > 0 && (
        <div className="my-2">
          <Sticker color="red" tilt={-6} slap>
            {hits.length === 1
              ? '1 naughty person in this game'
              : `${hits.length} naughty people in this game`}
          </Sticker>
        </div>
      )}
      <TeamList title="Us" players={allies} hitFor={hitFor} canFlag={canFlag} onFlag={onFlag} />
      <TeamList
        title="Them"
        players={enemies}
        hitFor={hitFor}
        canFlag={canFlag}
        onFlag={onFlag}
        hiddenNote={
          game.enemiesHidden
            ? "Riot won't tell us who they are until the loading screen."
            : undefined
        }
      />
    </div>
  )
}

function Scrap({ title, body }: { title: string; body: string }): React.JSX.Element {
  return (
    <div className="scrap mt-6 max-w-md">
      <h2 className="hand text-2xl leading-tight">{title}</h2>
      <p className="mt-2 text-ink-soft">{body}</p>
    </div>
  )
}

function TeamList(props: {
  title: string
  players: Player[]
  hitFor: (p: Player) => Hit | undefined
  canFlag: boolean
  onFlag: Props['onFlag']
  hiddenNote?: string
}): React.JSX.Element {
  return (
    <section className="mt-4">
      <h3 className="section-heading">{props.title}</h3>
      {props.hiddenNote ? (
        <p className="scratched">{props.hiddenNote}</p>
      ) : (
        <ul>
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
      )}
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
  const name = player.gameName ? `${player.gameName}#${player.tagLine}` : 'someone Riot is hiding'

  return (
    <li>
      <div className="row">
        <span className={`row-name ${hit ? 'is-naughty' : ''}`}>
          {hit && <Scribble />}
          {name}
        </span>
        {player.championName && <span className="scratched">as {player.championName}</span>}
        {hit && (
          <Sticker color="red" tilt={6} slap>
            naughty
          </Sticker>
        )}
        {canFlag && player.puuid && !open && (
          <button className="link-btn ml-auto" onClick={() => setOpen(true)}>
            tell on them
          </button>
        )}
      </div>
      {hit &&
        hit.flags.map((f) => (
          <div key={f.id} className="row pl-8">
            <span className="note">
              “{f.note}” <span className="note-by">says {f.createdByName}</span>
            </span>
          </div>
        ))}
      {open && (
        <form
          className="row gap-2 pl-8"
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
            className="pencil-input flex-1"
            placeholder="What did they do?"
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
            disabled={saving || !note.trim()}
          >
            Add to list
          </button>
          <button type="button" className="link-btn" onClick={() => setOpen(false)}>
            never mind
          </button>
        </form>
      )}
    </li>
  )
}
