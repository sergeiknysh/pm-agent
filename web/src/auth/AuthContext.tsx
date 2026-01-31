import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { getMe, login as apiLogin, logout as apiLogout } from '../api/auth'
import { setUnauthorizedHandler } from '../api/apiFetch'
import { navigate, setFlashMessage } from '../ui/router'

export type AuthUser = { username: string; roles: string[] }
export type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'guest'; user: null }
  | { status: 'authed'; user: AuthUser }

type AuthContextValue = {
  state: AuthState
  refresh: () => Promise<void>
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  setGuest: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}

export function AuthProvider(props: React.PropsWithChildren) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null })
  const stateRef = useRef<AuthState>(state)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  async function refresh(): Promise<void> {
    try {
      const me = await getMe()
      setState({ status: 'authed', user: me.user })
    } catch {
      setState({ status: 'guest', user: null })
    }
  }

  async function login(username: string, password: string): Promise<void> {
    const res = await apiLogin(username, password)
    setState({ status: 'authed', user: res.user })
  }

  async function logout(): Promise<void> {
    try {
      await apiLogout()
    } finally {
      setState({ status: 'guest', user: null })
    }
  }

  function setGuest() {
    setState({ status: 'guest', user: null })
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(({ url }) => {
      // Any API call returned 401:
      // - if we were authed, treat it as an expired session and show a message
      // - otherwise, just ensure we're on /login
      const wasAuthed = stateRef.current.status === 'authed'
      setState({ status: 'guest', user: null })
      if (wasAuthed && !url.endsWith('/api/me')) {
        setFlashMessage('сессия истекла')
      }
      navigate('/login', { replace: true })
    })
    return () => setUnauthorizedHandler(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ state, refresh, login, logout, setGuest }),
    [state],
  )

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>
}
