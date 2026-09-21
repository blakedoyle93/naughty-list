import { useEffect, useState } from 'react'
import type { CurrentGame, Hit, LcuState } from '@shared/types'
import { api } from '../api'

export function useGame(): { game: CurrentGame | null; hits: Hit[]; lcu: LcuState } {
  const [state, setState] = useState<{ game: CurrentGame | null; hits: Hit[] }>({
    game: null,
    hits: []
  })
  const [lcu, setLcu] = useState<LcuState>('disconnected')
  useEffect(() => {
    void api.invoke('game:get').then(setState)
    void api.invoke('lcu:getState').then(setLcu)
    const off1 = api.on('game:update', setState)
    const off2 = api.on('lcu:state', setLcu)
    return () => {
      off1()
      off2()
    }
  }, [])
  return { ...state, lcu }
}
