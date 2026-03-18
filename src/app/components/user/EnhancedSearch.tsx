import { useState, useEffect, useRef } from 'react'
import { Search, Clock, TrendingUp, X } from 'lucide-react'

interface SearchHistoryItem {
  query: string
  timestamp: string
}

const SEARCH_HISTORY_KEY = 'jb-hub:search-history'
const MAX_HISTORY_ITEMS = 20

interface SearchResult {
  id: number
  type: 'project' | 'tag' | 'department'
  title: string
  subtitle?: string
}

interface EnhancedSearchBarProps {
  onSearch?: (query: string) => void
  placeholder?: string
  projects?: any[]
}

export function EnhancedSearchBar({
  onSearch,
  placeholder = '프로젝트, 태그, 부서 검색...',
  projects = [],
}: EnhancedSearchBarProps) {
  const [query, setQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeTab, setActiveTab] = useState<'all' | 'projects' | 'tags' | 'departments'>('all')
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([])
  const [suggestions, setSuggestions] = useState<SearchResult[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<NodeJS.Timeout>()

  useEffect(() => {
    loadSearchHistory()
  }, [])

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(() => {
      if (query.trim()) {
        generateSuggestions(query.trim())
      } else {
        setSuggestions([])
      }
    }, 300)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [query, projects, activeTab])

  const loadSearchHistory = () => {
    try {
      const stored = localStorage.getItem(SEARCH_HISTORY_KEY)
      const history = stored ? JSON.parse(stored) : []
      setSearchHistory(history)
    } catch {
      setSearchHistory([])
    }
  }

  const generateSuggestions = (searchQuery: string) => {
    const q = searchQuery.toLowerCase()
    const results: SearchResult[] = []

    // 프로젝트 검색
    if (activeTab === 'all' || activeTab === 'projects') {
      projects.forEach((project) => {
        if (
          project.title?.toLowerCase().includes(q) ||
          project.description?.toLowerCase().includes(q)
        ) {
          results.push({
            id: project.id,
            type: 'project',
            title: project.title,
            subtitle: project.department,
          })
        }
      })
    }

    // 태그 검색
    if (activeTab === 'all' || activeTab === 'tags') {
      const allTags = new Set<string>()
      projects.forEach((p) => {
        p.tags?.forEach((tag: string) => allTags.add(tag))
      })

      allTags.forEach((tag) => {
        if (tag.toLowerCase().includes(q)) {
          results.push({
            id: tag.length,
            type: 'tag',
            title: tag,
            subtitle: '태그',
          })
        }
      })
    }

    // 부서 검색
    if (activeTab === 'all' || activeTab === 'departments') {
      const departments = new Set(projects.map((p) => p.department))

      departments.forEach((dept) => {
        if (dept.toLowerCase().includes(q)) {
          results.push({
            id: dept.length,
            type: 'department',
            title: dept,
            subtitle: '부서',
          })
        }
      })
    }

    setSuggestions(results.slice(0, 8))
  }

  const handleSearch = (searchQuery?: string) => {
    const q = (searchQuery ?? query).trim()
    if (!q) return

    addToSearchHistory(q)
    onSearch?.(q)
    setShowSuggestions(false)
    setQuery(q)
  }

  const handleClear = () => {
    setQuery('')
    setSuggestions([])
    inputRef.current?.focus()
  }

  const handleSuggestionClick = (result: SearchResult) => {
    const q = result.type === 'project' ? result.title : result.title
    handleSearch(q)
  }

  const handleHistoryClick = (item: SearchHistoryItem) => {
    setQuery(item.query)
    handleSearch(item.query)
  }

  return (
    <div className="relative w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleSearch()
            } else if (e.key === 'Escape') {
              setShowSuggestions(false)
            }
          }}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {showSuggestions && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-lg border border-gray-200 z-50 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            {(['all', 'projects', 'tags', 'departments'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {tab === 'all' ? '전체' : tab === 'projects' ? '프로젝트' : tab === 'tags' ? '태그' : '부서'}
              </button>
            ))}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {/* 검색 결과 */}
            {query && suggestions.length > 0 && (
              <div>
                <div className="px-4 py-2 text-xs text-gray-500 bg-gray-50 font-medium">
                  검색 결과
                </div>
                {suggestions.map((result) => (
                  <button
                    key={result.id + result.type}
                    onClick={() => handleSuggestionClick(result)}
                    className="w-full px-4 py-2.5 text-left hover:bg-gray-50 flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{result.title}</p>
                      {result.subtitle && (
                        <p className="text-sm text-gray-500">{result.subtitle}</p>
                      )}
                    </div>
                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                      {result.type === 'project' ? '프로젝트' : result.type === 'tag' ? '태그' : '부서'}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* 최근 검색어 */}
            {!query && searchHistory.length > 0 && (
              <div>
                <div className="px-4 py-2 text-xs text-gray-500 bg-gray-50 font-medium flex items-center justify-between">
                  <span>최근 검색어</span>
                  <button
                    onClick={clearSearchHistory}
                    className="text-red-600 hover:text-red-700"
                  >
                    전체 삭제
                  </button>
                </div>
                {searchHistory.slice(0, 5).map((item, index) => (
                  <button
                    key={index}
                    onClick={() => handleHistoryClick(item)}
                    className="w-full px-4 py-2.5 text-left hover:bg-gray-50 flex items-center gap-3"
                  >
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span className="flex-1 text-gray-700">{item.query}</span>
                  </button>
                ))}
              </div>
            )}

            {/* 인기 검색어 */}
            {!query && (
              <div>
                <div className="px-4 py-2 text-xs text-gray-500 bg-gray-50 font-medium flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  인기 검색어
                </div>
                {['AI', 'React', '디자인 시스템', 'API', '데이터분석'].slice(0, 5).map((term) => (
                  <button
                    key={term}
                    onClick={() => handleSearch(term)}
                    className="w-full px-4 py-2.5 text-left hover:bg-gray-50 text-gray-700"
                  >
                    {term}
                  </button>
                ))}
              </div>
            )}

            {/* 빈 상태 */}
            {query && suggestions.length === 0 && (
              <div className="px-4 py-8 text-center text-gray-500">
                <Search className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>검색 결과가 없습니다</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// 검색 기록 관련 함수
export function addToSearchHistory(query: string) {
  try {
    const stored = localStorage.getItem(SEARCH_HISTORY_KEY)
    const history: SearchHistoryItem[] = stored ? JSON.parse(stored) : []

    // 중복 제거
    const filtered = history.filter((item) => item.query !== query)

    // 맨 앞에 추가
    filtered.unshift({
      query,
      timestamp: new Date().toISOString(),
    })

    // 최대 개수 제한
    const trimmed = filtered.slice(0, MAX_HISTORY_ITEMS)

    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(trimmed))
  } catch (e) {
    console.error('Failed to save search history:', e)
  }
}

export function getSearchHistory(): SearchHistoryItem[] {
  try {
    const stored = localStorage.getItem(SEARCH_HISTORY_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

export function clearSearchHistory() {
  try {
    localStorage.removeItem(SEARCH_HISTORY_KEY)
  } catch (e) {
    console.error('Failed to clear search history:', e)
  }
}
