import { useState, useEffect, useMemo, type ReactNode } from 'react'
import {
  Keyboard,
  X,
  Search,
  Home,
  Star,
  MessageSquare,
  Slash,
  FolderGit2,
  LayoutDashboard,
  Settings,
  PlusCircle,
  Share2,
  Command,
} from 'lucide-react'

interface ShortcutItem {
  key: string
  description: string
  category: string
  icon?: ReactNode
}

interface KeyboardShortcutsProps {
  onClose?: () => void
}

const SHORTCUTS: ShortcutItem[] = [
  // 네비게이션
  { key: 'G + H', description: '홈으로 이동', category: '네비게이션', icon: <Home className="w-4 h-4" /> },
  { key: 'G + P', description: '프로젝트로 이동', category: '네비게이션', icon: <FolderGit2 className="w-4 h-4" /> },
  { key: 'G + C', description: '커뮤니티로 이동', category: '네비게이션', icon: <MessageSquare className="w-4 h-4" /> },
  { key: 'G + D', description: '대시보드로 이동', category: '네비게이션', icon: <LayoutDashboard className="w-4 h-4" /> },
  { key: 'G + S', description: '설정으로 이동', category: '네비게이션', icon: <Settings className="w-4 h-4" /> },

  // 검색
  { key: '/', description: '검색창 포커스', category: '검색', icon: <Search className="w-4 h-4" /> },
  { key: 'Esc', description: '검색창/모달 닫기', category: '검색', icon: <X className="w-4 h-4" /> },

  // 프로젝트
  { key: 'S', description: '프로젝트 저장', category: '프로젝트', icon: <Star className="w-4 h-4" /> },
  { key: 'N', description: '새 프로젝트', category: '프로젝트', icon: <PlusCircle className="w-4 h-4" /> },
  { key: 'F', description: '프로젝트 공유', category: '프로젝트', icon: <Share2 className="w-4 h-4" /> },

  // 일반
  { key: '?', description: '단축키 도움말', category: '일반', icon: <Keyboard className="w-4 h-4" /> },
  { key: 'K', description: '명령 팔레트', category: '일반', icon: <Command className="w-4 h-4" /> },
]

export function KeyboardShortcuts({ onClose }: KeyboardShortcutsProps) {
  const [searchQuery, setSearchQuery] = useState('')

  // 키보드 단축키로 도움말 열기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose?.()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const normalizedQuery = searchQuery.trim().toLowerCase()

  const filteredShortcuts = useMemo(
    () =>
      SHORTCUTS.filter(
        (shortcut) =>
          shortcut.description.toLowerCase().includes(normalizedQuery) ||
          shortcut.key.toLowerCase().includes(normalizedQuery) ||
          shortcut.category.toLowerCase().includes(normalizedQuery),
      ),
    [normalizedQuery],
  )

  const categories = useMemo(() => {
    const order = ['네비게이션', '검색', '프로젝트', '일반']
    return order.filter((category) => filteredShortcuts.some((shortcut) => shortcut.category === category))
  }, [filteredShortcuts])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
      <div className="surface-panel flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl">
        <div className="border-b border-slate-200/80 p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Keyboard className="h-5 w-5 text-[#315779]" />
              <h2 className="text-xl font-bold text-slate-900">키보드 단축키</h2>
            </div>
            <button type="button" onClick={onClose} className="glass-inline-button !px-2.5 !py-1.5 text-xs">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="단축키 검색..."
              className="select-soft pl-10"
            />
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-5 sm:p-6">
          {filteredShortcuts.length === 0 && (
            <div className="empty-panel !rounded-2xl !py-12">
              조건에 맞는 단축키가 없습니다.
            </div>
          )}
          {categories.map((category) => {
            const categoryShortcuts = filteredShortcuts.filter((s) => s.category === category)

            if (categoryShortcuts.length === 0) return null

            return (
              <div key={category} className="mb-6 last:mb-0">
                <h4 className="mb-3 text-xs font-semibold tracking-[0.08em] text-slate-500">
                  {category}
                </h4>
                <div className="space-y-2">
                  {categoryShortcuts.map((shortcut, index) => (
                    <div
                      key={`${category}-${index}`}
                      className="surface-soft flex items-center justify-between rounded-xl p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg border border-slate-200 bg-[#eaf1f8] p-2 text-[#315779]">
                          {shortcut.icon}
                        </div>
                        <span className="text-sm text-slate-700">{shortcut.description}</span>
                      </div>
                      <div className="flex gap-1">
                        {shortcut.key.split(' + ').map((k, i) => (
                          <div key={i} className="flex items-center">
                            <kbd className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-mono text-slate-700">
                              {k}
                            </kbd>
                            {i < shortcut.key.split(' + ').length - 1 && (
                              <span className="mx-1 text-slate-400">+</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <div className="border-t border-slate-200/80 bg-slate-50/80 p-4">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <div className="flex items-center gap-2">
              <Slash className="h-4 w-4" />
              <span>언제든지</span>
              <kbd className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-mono">
                ?
              </kbd>
              <span>키를 눌러 이 도움말을 열 수 있습니다</span>
            </div>
            <button type="button" onClick={onClose} className="glass-inline-button !px-3 !py-1.5 text-xs">
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// 키보드 단축키 표시 컴포넌트
export function KeyboardShortcutKey({ keys }: { keys: string[] }) {
  return (
    <div className="inline-flex items-center">
      {keys.map((key, index) => (
        <div key={index} className="flex items-center">
          <kbd className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-mono text-slate-600">
            {key}
          </kbd>
          {index < keys.length - 1 && (
            <span className="mx-1 text-xs text-slate-400">+</span>
          )}
        </div>
      ))}
    </div>
  )
}

// 플로팅 도움말 버튼
export function KeyboardHelpButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-40 flex h-11 w-11 items-center justify-center rounded-xl border border-[#264969] bg-[#264969] text-white shadow-[0_8px_18px_rgba(18,39,58,0.2)] transition-colors hover:border-[#1f3e5a] hover:bg-[#1f3e5a]"
      title="키보드 단축키 (?)"
    >
      <Keyboard className="w-5 h-5" />
    </button>
  )
}
