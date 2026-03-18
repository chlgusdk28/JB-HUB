import { useEffect, useState } from 'react'
import { Settings } from 'lucide-react'
import RestoredHubApp from './components/RestoredHubApp'
import AdminConsolePage from './components/admin/AdminConsolePage'

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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handlePopState = () => setPathname(normalizePathname(window.location.pathname))
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

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

  if (pathname === '/admin') {
    return <AdminConsolePage onNavigateHome={() => navigate('/')} />
  }

  return (
    <>
      <RestoredHubApp />
      <button
        type="button"
        onClick={() => navigate('/admin')}
        className="fixed bottom-5 right-5 z-[60] inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-white/95 px-4 py-3 text-sm font-semibold text-slate-900 shadow-[0_16px_40px_rgba(15,23,42,0.18)] backdrop-blur transition hover:-translate-y-0.5 hover:border-slate-400"
      >
        <Settings className="h-4 w-4" />
        관리자 페이지
      </button>
    </>
  )
}
