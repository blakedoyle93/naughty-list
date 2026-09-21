import { useCallback, useEffect, useState } from 'react'
import type { PlayerRecord, RiotId } from '@shared/types'
import { api } from '../api'

/** `refreshKey` changes re-fetch the list (e.g. flag count). */
export function usePlayers(refreshKey: unknown): {
  players: PlayerRecord[]
  lookup: (id: RiotId) => Promise<PlayerRecord | null>
} {
  const [players, setPlayers] = useState<PlayerRecord[]>([])
  useEffect(() => {
    void api.invoke('players:list').then(setPlayers)
  }, [refreshKey])
  const lookup = useCallback((id: RiotId) => api.invoke('players:lookup', id), [])
  return { players, lookup }
}
