import { useCallback, useEffect, useState } from 'react'
import type { Flag } from '@shared/types'
import { api } from '../api'

export function useFlags(): {
  flags: Flag[]
  add: (puuid: string, note: string) => Promise<void>
  remove: (id: string) => Promise<void>
} {
  const [flags, setFlags] = useState<Flag[]>([])
  useEffect(() => {
    void api.invoke('flags:list').then(setFlags)
    return api.on('flags:changed', setFlags)
  }, [])
  const add = useCallback(async (puuid: string, note: string) => {
    await api.invoke('flags:add', { puuid, note })
  }, [])
  const remove = useCallback(async (id: string) => {
    await api.invoke('flags:delete', id)
  }, [])
  return { flags, add, remove }
}
