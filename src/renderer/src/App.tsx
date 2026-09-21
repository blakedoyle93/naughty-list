import { useState } from 'react'
import { CurrentGame } from './tabs/CurrentGame'
import { NaughtyList } from './tabs/NaughtyList'
import { Crew } from './tabs/Crew'
import { useGame } from './hooks/useGame'
import { useFlags } from './hooks/useFlags'
import { useAuth } from './hooks/useAuth'
import { Sticker } from './components/Sticker'

type Tab = 'game' | 'list' | 'crew'

const TABS: Array<{ id: Tab; label: string; color: string }> = [
  { id: 'game', label: 'This game', color: 'var(--color-crayon-yellow)' },
  { id: 'list', label: 'The list', color: 'var(--color-crayon-red)' },
  { id: 'crew', label: 'My crew', color: 'var(--color-crayon-blue)' }
]

export default function App(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('game')
  const gameState = useGame()
  const flagsState = useFlags()
  const authState = useAuth()
  const connected = gameState.lcu === 'connected'

  return (
    <div className="page">
      <div className="page-body">
        <header className="flex items-end justify-between gap-6">
          <div>
            <h1 className="title">Naughty List</h1>
            <svg
              className="title-underline"
              viewBox="0 0 300 10"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                d="M2 6 C 30 2, 60 9, 90 5 S 150 2, 180 6 S 240 9, 298 4"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <Sticker color={connected ? 'green' : 'paper'} tilt={connected ? 5 : -3}>
            {connected ? 'League is open' : 'League is closed'}
          </Sticker>
        </header>

        <nav className="tabs mt-6" role="tablist" aria-label="Pages">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className="tab"
              style={
                {
                  '--tab-color': t.color,
                  color: t.id === 'game' ? undefined : '#fff'
                } as React.CSSProperties
              }
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="h-0.5 bg-ink" />

        <main className="mt-4">
          {tab === 'game' && <CurrentGame {...gameState} onFlag={flagsState.add} />}
          {tab === 'list' && (
            <NaughtyList
              flags={flagsState.flags}
              onAdd={flagsState.add}
              onRemove={flagsState.remove}
              userId={authState.user?.id ?? null}
            />
          )}
          {tab === 'crew' && <Crew auth={authState} />}
        </main>
      </div>
    </div>
  )
}
