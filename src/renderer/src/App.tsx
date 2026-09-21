import { useState } from 'react'
import { CurrentGame } from './tabs/CurrentGame'
import { NaughtyList } from './tabs/NaughtyList'
import { Crew } from './tabs/Crew'
import { useGame } from './hooks/useGame'
import { useFlags } from './hooks/useFlags'
import { useAuth } from './hooks/useAuth'

type Tab = 'game' | 'list' | 'crew'

export default function App(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('game')
  const gameState = useGame()
  const flagsState = useFlags()
  const authState = useAuth()

  const tabs: Array<[Tab, string]> = [
    ['game', 'Current game'],
    ['list', 'Naughty list'],
    ['crew', 'Crew']
  ]
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        <h1 className="text-lg font-bold">Naughty List</h1>
        <nav className="flex gap-1">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`rounded px-3 py-1 text-sm ${tab === id ? 'bg-zinc-800' : 'hover:bg-zinc-900'}`}
            >
              {label}
            </button>
          ))}
        </nav>
        <span
          className={`text-xs ${gameState.lcu === 'connected' ? 'text-green-400' : 'text-zinc-500'}`}
        >
          {gameState.lcu === 'connected' ? '● client connected' : '○ client offline'}
        </span>
      </header>
      <main className="mx-auto max-w-3xl p-6">
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
  )
}
