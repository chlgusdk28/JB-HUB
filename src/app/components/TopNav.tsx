import { Search, Bell, Plus } from 'lucide-react'

interface TopNavProps {
  onNewProject: () => void
}

export function TopNav({ onNewProject }: TopNavProps) {
  return (
    <header className="fixed left-0 right-0 top-0 z-50 h-16 border-b border-gray-200 bg-white">
      <div className="flex h-full items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600">
            <span className="text-sm font-bold text-white">JB</span>
          </div>
          <h1 className="text-lg font-semibold text-gray-900">JB-Hub 커뮤니티</h1>
        </div>

        <div className="mx-8 max-w-2xl flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="프로젝트, 문서, 사용자를 검색하세요."
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-4 text-sm transition-all focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onNewProject}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            새 프로젝트
          </button>

          <button className="relative rounded-lg p-2 transition-all hover:bg-gray-100" aria-label="알림">
            <Bell className="h-5 w-5 text-gray-600" />
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
          </button>

          <div className="flex items-center gap-2 border-l border-gray-200 pl-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-purple-400 to-pink-400">
              <span className="text-sm font-medium text-white">김</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
