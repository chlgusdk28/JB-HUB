import { ReactNode, useState } from 'react'
import { Menu, X } from 'lucide-react'

interface LayoutProps {
  children: ReactNode
  sidebar?: ReactNode
}

export function Sidebar({ isOpen, onClose, children }: { isOpen: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <>
      {isOpen ? <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onClose} /> : null}

      <div
        className={`
          fixed left-0 top-0 z-50 h-full w-64 border-r border-slate-200 bg-white
          transition-transform duration-300
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:static lg:z-30 lg:translate-x-0
        `}
      >
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <span className="font-semibold">메뉴</span>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100 lg:hidden" aria-label="사이드바 닫기">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </>
  )
}

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 font-bold text-white">
              J
            </div>
            <span className="font-semibold text-slate-900">JB-Hub</span>
          </div>

          <button onClick={onMenuClick} className="rounded-lg p-2 hover:bg-slate-100 lg:hidden" aria-label="메뉴 열기">
            <Menu className="h-6 w-6" />
          </button>

          <nav className="hidden items-center gap-6 lg:flex">
            <a href="#" className="font-medium text-slate-700 hover:text-slate-900">홈</a>
            <a href="#" className="font-medium text-slate-700 hover:text-slate-900">프로젝트</a>
            <a href="#" className="font-medium text-slate-700 hover:text-slate-900">랭킹</a>
            <a href="#" className="font-medium text-slate-700 hover:text-slate-900">커뮤니티</a>
          </nav>
        </div>
      </div>
    </header>
  )
}

export function ResponsiveLayout({ children, sidebar }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-slate-50">
      <Header onMenuClick={() => setSidebarOpen(true)} />

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)}>
        {sidebar}
      </Sidebar>

      <main className="lg:ml-64">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  )
}
