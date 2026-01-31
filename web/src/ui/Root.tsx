import { AuthProvider, useAuth } from '../auth/AuthContext'
import { App as KanbanApp } from './App'
import { Login } from './Login'
import { navigate, usePathname } from './router'

function Routes() {
  const { state } = useAuth()
  const path = usePathname()

  // While we don't know yet, keep it simple.
  if (state.status === 'loading') {
    return (
      <div className="app">
        <header className="topbar">
          <div className="brand">PM Kanban</div>
        </header>
        <div style={{ padding: 16, color: 'rgba(231, 236, 255, 0.75)' }}>Loading…</div>
      </div>
    )
  }

  if (path === '/login') {
    return <Login />
  }

  // Guard: any non-/login route requires auth.
  if (state.status !== 'authed') {
    navigate('/login', { replace: true })
    return <Login />
  }

  return <KanbanApp />
}

export function Root() {
  return (
    <AuthProvider>
      <Routes />
    </AuthProvider>
  )
}
