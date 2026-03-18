import { Search, Plus } from 'lucide-react'

interface OpalTopNavProps {
  onNewProject: () => void
}

export function OpalTopNav({ onNewProject }: OpalTopNavProps) {
  return (
    <header className="fixed left-0 right-0 top-0 z-50 h-20 bg-white/80 backdrop-blur-sm">
      <div className="mx-auto flex h-full max-w-[1400px] items-center justify-between px-20">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-sm">
            <span className="text-base font-semibold text-white">JB</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">JB-Hub 커뮤니티</h1>
        </div>

        <div className="mx-12 max-w-2xl flex-1">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="프로젝트, 문서, 사용자를 검색하세요."
              className="w-full rounded-xl bg-gray-50 py-3 pl-12 pr-4 text-[15px] placeholder:text-gray-400 transition-all focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={onNewProject}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-[15px] font-medium text-white shadow-sm transition-all hover:bg-blue-700"
          >
            <Plus className="h-5 w-5" />
            새 프로젝트
          </button>

          <div className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-gradient-to-br from-purple-400 to-pink-400 shadow-sm transition-transform hover:scale-105">
            <span className="text-[15px] font-medium text-white">김</span>
          </div>
        </div>
      </div>
    </header>
  )
}
