import { Search, X, SlidersHorizontal, Loader2 } from 'lucide-react';

interface ExploreHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedTechStack: string[];
  onRemoveTech: (tech: string) => void;
  selectedDepartment: string | null;
  onRemoveDepartment: () => void;
  totalResults: number;
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
  isSearching?: boolean;
}

export function ExploreHeader({
  searchQuery,
  onSearchChange,
  selectedTechStack,
  onRemoveTech,
  selectedDepartment,
  onRemoveDepartment,
  totalResults,
  viewMode,
  onViewModeChange,
  isSearching = false,
}: ExploreHeaderProps) {
  const techStackLabels: Record<string, string> = {
    python: 'Python',
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    java: 'Java',
    spring: 'Spring',
    react: 'React',
    nodejs: 'Node.js',
    docker: 'Docker',
    aws: 'AWS',
    rpa: 'RPA',
  };

  const departmentLabels: Record<string, string> = {
    it: 'IT기획팀',
    frontend: '프론트엔드팀',
    backend: '백엔드팀',
    devops: 'DevOps팀',
    data: '데이터팀',
    finance: '재무팀',
    legal: '법무팀',
  };

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="프로젝트명, 태그, 작성자로 검색..."
            className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Active Filters */}
        {(selectedTechStack.length > 0 || selectedDepartment) && (
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100">
            <span className="text-xs text-gray-600 font-medium">적용된 필터:</span>
            
            {selectedTechStack.map((tech) => (
              <button
                key={tech}
                onClick={() => onRemoveTech(tech)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 text-blue-700 rounded-md text-xs font-medium hover:bg-blue-100 transition-all"
              >
                {techStackLabels[tech]}
                <X className="w-3 h-3" />
              </button>
            ))}

            {selectedDepartment && (
              <button
                onClick={onRemoveDepartment}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-purple-50 text-purple-700 rounded-md text-xs font-medium hover:bg-purple-100 transition-all"
              >
                {departmentLabels[selectedDepartment]}
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Results Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">프로젝트 탐색</h2>
          <p className="text-sm text-gray-600 flex items-center gap-2">
            총 <span className="font-semibold text-gray-900">{totalResults}</span>개의 프로젝트
            {isSearching && (
              <span className="flex items-center gap-1 text-blue-600">
                <Loader2 className="w-3 h-3 animate-spin" />
                검색 중...
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => onViewModeChange('grid')}
              className={`px-4 py-2 text-sm font-medium transition-all ${
                viewMode === 'grid'
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              그리드
            </button>
            <button
              onClick={() => onViewModeChange('list')}
              className={`px-4 py-2 text-sm font-medium border-l border-gray-200 transition-all ${
                viewMode === 'list'
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              리스트
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
