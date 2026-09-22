import { useEffect, useState } from 'react'
import type { UpdateStatus } from '@shared/types'
import { api } from '../api'

const WORDS: Record<UpdateStatus['state'], string> = {
  idle: 'Check for updates',
  checking: 'Checking…',
  current: 'You have the latest',
  available: 'A new version is out',
  downloading: 'Downloading the update…',
  ready: 'Update ready',
  error: "Couldn't check"
}

/** Version line with a manual check. Windows installs; everyone else gets the download link. */
export function UpdateBadge(): React.JSX.Element {
  const [status, setStatus] = useState<UpdateStatus | null>(null)

  useEffect(() => {
    void api.invoke('update:get').then(setStatus)
    return api.on('update:status', setStatus)
  }, [])

  if (!status) return <span className="note-by">…</span>
  const newer = status.latest && status.latest !== status.version

  return (
    <span className="row">
      <span className="note-by">v{status.version}</span>
      <span className={status.state === 'error' ? 'note-by text-crayon-red' : 'note-by'}>
        {WORDS[status.state]}
        {newer && status.state !== 'ready' ? ` (v${status.latest})` : ''}
      </span>
      {status.state === 'ready' && (
        <button
          className="crayon-btn"
          style={
            { '--btn-color': 'var(--color-crayon-green)', color: '#fff' } as React.CSSProperties
          }
          onClick={() => void api.invoke('update:install')}
        >
          Restart to update
        </button>
      )}
      {status.state === 'available' && !status.canSelfUpdate && (
        <button className="link-btn" onClick={() => void api.invoke('update:openReleases')}>
          download v{status.latest}
        </button>
      )}
      {status.state !== 'ready' && (
        <button
          className="link-btn"
          disabled={status.state === 'checking' || status.state === 'downloading'}
          onClick={() => void api.invoke('update:check').then(setStatus)}
        >
          check again
        </button>
      )}
    </span>
  )
}
