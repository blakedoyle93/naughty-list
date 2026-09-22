import { useGame } from './hooks/useGame'

/** Small hand-drawn cross, the "this one" marker next to a flagged name. */
function Mark(): React.JSX.Element {
  return (
    <svg className="overlay-mark" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3 3 C 7 6, 9 10, 13 13 M13 3 C 9 6, 7 10, 3 13"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * The floating card that sits over the League client and the loading screen.
 * Click-through and read-only: it names who is flagged and why, nothing else.
 */
export default function Overlay(): React.JSX.Element | null {
  const { hits } = useGame()
  if (hits.length === 0) return null

  return (
    <div className="overlay-card">
      <p className="overlay-heading">
        {hits.length === 1 ? 'Someone here is on the list' : `${hits.length} here are on the list`}
      </p>
      <ul className="overlay-list">
        {hits.map((hit) => (
          <li key={hit.player.puuid ?? hit.player.gameName} className="overlay-row">
            <Mark />
            <div className="overlay-who">
              <span className="overlay-name">{hit.player.gameName}</span>
              <span className="overlay-team">{hit.player.team === 'ally' ? 'us' : 'them'}</span>
              <span className="overlay-note">{hit.flags[0]?.note ?? 'no reason given'}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
