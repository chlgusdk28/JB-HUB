import { Search } from 'lucide-react';

interface QuietTopNavProps {
  onNewProject: () => void;
}

export function QuietTopNav({ onNewProject }: QuietTopNavProps) {
  return (
    <header className="h-24 bg-white/60 backdrop-blur-md fixed top-0 left-0 right-0 z-50 border-b border-gray-100">
      <div className="h-full max-w-6xl mx-auto px-24 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gray-900 rounded-xl"></div>
          <span className="text-base text-gray-900 font-medium">오픈소스 커뮤니티</span>
        </div>

        {/* Search */}
        <div className="flex-1 max-w-md mx-16">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="검색"
              className="w-full pl-11 pr-4 py-2.5 bg-gray-50 rounded-lg text-sm placeholder:text-gray-400 focus:outline-none focus:bg-gray-100 transition-colors"
            />
          </div>
        </div>

        {/* Profile */}
        <div className="flex items-center gap-4">
          <button
            onClick={onNewProject}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            새 프로젝트
          </button>
          <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
        </div>
      </div>
    </header>
  );
}
