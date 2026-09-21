import { useCallback, useEffect, useState } from 'react'
import type { AuthUser } from '@shared/types'
import { api } from '../api'

export interface AuthState {
  user: AuthUser | null
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  loading: boolean
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    void api.invoke('auth:get').then(setUser)
    return api.on('auth:changed', setUser)
  }, [])
  const signIn = useCallback(async () => {
    setLoading(true)
    try {
      setUser(await api.invoke('auth:signIn'))
    } finally {
      setLoading(false)
    }
  }, [])
  const signOut = useCallback(async () => {
    await api.invoke('auth:signOut')
    setUser(null)
  }, [])
  return { user, signIn, signOut, loading }
}
