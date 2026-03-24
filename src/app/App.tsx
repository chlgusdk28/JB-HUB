import { useEffect, useState } from 'react'
import { AuthLoginPage } from './components/AuthLoginPage'
import RestoredHubApp from './components/RestoredHubApp'
import AdminConsolePage from './components/admin/AdminConsolePage'
import {
  authenticateHubUser,
  listHubDemoAccounts,
  persistHubSession,
  restoreHubSession,
  type HubSession,
} from './lib/hub-auth'
import { applyUserSettings, loadUserSettings } from './lib/user-settings'

function normalizePathname(pathname: string) {
  if (!pathname || pathname === '/') {
    return '/'
  }

  return pathname.replace(/\/+$/, '') || '/'
}

export default function App() {
  const [pathname, setPathname] = useState(() =>
    typeof window === 'undefined' ? '/' : normalizePathname(window.location.pathname),
  )
  const [session, setSession] = useState<HubSession | null>(() => restoreHubSession())

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handlePopState = () => setPathname(normalizePathname(window.location.pathname))
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    applyUserSettings(loadUserSettings())
  }, [])

  useEffect(() => {
    persistHubSession(session)
  }, [session])

  function navigate(nextPath: string) {
    if (typeof window === 'undefined') {
      return
    }

    const normalized = normalizePathname(nextPath)
    if (normalized === pathname) {
      return
    }

    window.history.pushState({}, '', normalized)
    setPathname(normalized)
    window.scrollTo(0, 0)
  }

  function handleLogin(username: string, password: string) {
    const result = authenticateHubUser(username, password)
    if (result.success && result.session) {
      setSession(result.session)
    }

    return {
      success: result.success,
      error: result.error,
    }
  }

  function handleLogout() {
    setSession(null)
    navigate('/')
  }

  if (pathname === '/admin') {
    return <AdminConsolePage onNavigateHome={() => navigate('/')} />
  }

  if (!session) {
    return (
      <AuthLoginPage
        onSubmitLogin={handleLogin}
        demoAccounts={listHubDemoAccounts()}
        onOpenAdminPage={() => navigate('/admin')}
      />
    )
  }

  return (
    <RestoredHubApp
      currentUser={session}
      onLogout={handleLogout}
      onOpenAdminConsole={session.role === 'admin' ? () => navigate('/admin') : undefined}
    />
  )
}
