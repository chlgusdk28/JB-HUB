import { useState, useEffect, useRef } from 'react'
import { Search, X, Clock, TrendingUp, Tag } from 'lucide-react'

interface SearchResult {
  id: number
  type: 'project' | 'tag' | 'department'
  title: string
  subtitle?: string
  tags?: string[]
  stars?: number
  link: string
}

interface SearchHistoryItem {
  query: string
  searchedAt: string
}

const SEARCH_HISTORY_KEY = 'jbhub_search_history'
const MAX_HISTORY = 10

// 인기 검색어 (데모)
const POPULAR_SEARCHES = [
  'AI', 'Python', 'React', '자동화', 'API', 'RPA',
  '数据分析', 'ChatGPT', 'Docker', 'Slack'
]

export function getSearchHistory(): SearchHistoryItem[] {
  try {
    const stored = localStorage.getItem(SEARCH_HISTORY_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {
    // Ignore error
  }
  return []
}

export function addToSearchHistory(query: string) {
  if (!query.trim()) return

  const history = getSearchHistory()
  const filtered = history.filter(h => h.query.toLowerCase() !== query.toLowerCase())
  const newHistory = [
    { query, searchedAt: new Date().toISOString() },
    ...filtered,
  ].slice(0, MAX_HISTORY)

  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(newHistory))
}

export function clearSearchHistory() {
  localStorage.removeItem(SEARCH_HISTORY_KEY)
}

interface EnhancedSearchBarProps {
  onSearch: (query: string) => void
  onNavigate?: (path: string) => void
  placeholder?: string
}

export function EnhancedSearchBar({ onSearch, onNavigate, placeholder = '프로젝트, 태그, 부서 검색...' }: EnhancedSearchBarProps) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([])
  const [activeTab, setActiveTab] = useState<'all' | 'projects' | 'tags' | 'departments'>('all')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setSearchHistory(getSearchHistory())
  }, [])

  useEffect(() => {
    // 외부 클릭 시 닫기
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const delayTimer = setTimeout(() => {
      if (query.trim()) {
        performSearch(query.trim())
      } else {
        setResults([])
      }
    }, 300)

    return () => clearTimeout(delayTimer)
  }, [query])

  const performSearch = async (searchQuery: string) => {
    setIsSearching(true)

    try {
      // 프로젝트 검색
      const projectResponse = await fetch(`/api/v1/projects?search=${encodeURIComponent(searchQuery)}&limit=5`)
      let projectResults: SearchResult[] = []
      if (projectResponse.ok) {
        const data = await projectResponse.json()
        projectResults = (data.projects || []).map((p: any) => ({
          id: p.id,
          type: 'project' as const,
          title: p.title,
          subtitle: `${p.department} · ${p.author}`,
          tags: p.tags,
          stars: p.stars,
          link: `/project/${p.id}`,
        }))
      }

      // 태그 검색
      const tagResults: SearchResult[] = []
      if (activeTab === 'all' || activeTab === 'tags') {
        // 태그 필터링 (클라이언트 사이드)
        const allTagsResponse = await fetch('/api/v1/projects')
        if (allTagsResponse.ok) {
          const allProjects = await allProjectsResponse.json()
          const allTags = new Set<string>()
          ;(allProjects.projects || []).forEach((p: any) => {
            ;(p.tags || []).forEach((t: string) => allTags.add(t))
          })

          const matchingTags = Array.from(allTags)
            .filter(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
            .slice(0, 3)

          tagResults.push(...matchingTags.map(tag => ({
            id: Date.now() + Math.random(),
            type: 'tag' as const,
            title: tag,
            subtitle: '태그',
            link: `/?tags=${encodeURIComponent(tag)}`,
          })))
        }
      }

      // 부서 검색
      const deptResults: SearchResult[] = []
      if (activeTab === 'all' || activeTab === 'departments') {
        const allTagsResponse = await fetch('/api/v1/projects')
        if (allTagsResponse.ok) {
          const allProjects = await allTagsResponse.json()
          const allDepts = new Set<string>()
          ;(allProjects.projects || []).forEach((p: any) => {
            allDepts.add(p.department)
          })

          const matchingDepts = Array.from(allDepts)
            .filter(dept => dept.toLowerCase().includes(searchQuery.toLowerCase()))
            .slice(0, 3)

          deptResults.push(...matchingDepts.map(dept => ({
            id: Date.now() + Math.random(),
            type: 'department' as const,
            title: dept,
            subtitle: '부서',
            link: `/?department=${encodeURIComponent(dept)}`,
          })))
        }
      }

      setResults([...projectResults, ...tagResults, ...deptResults])
    } catch {
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }

  const handleSearch = (searchQuery: string = query) => {
    if (!searchQuery.trim()) return

    addToSearchHistory(searchQuery.trim())
    onSearch(searchQuery.trim())
    setIsOpen(false)
    setQuery('')
  }

  const handleResultClick = (result: SearchResult) => {
    addToSearchHistory(query.trim())
    if (onNavigate) {
      onNavigate(result.link)
    }
    setIsOpen(false)
    setQuery('')
  }

  const handleHistoryClick = (historyItem: SearchHistoryItem) => {
    setQuery(historyItem.query)
    handleSearch(historyItem.query)
  }

  const handlePopularClick = (popularQuery: string) => {
    setQuery(popularQuery)
    handleSearch(popularQuery)
  }

  const handleRemoveHistory = (historyItem: SearchHistoryItem) => {
    const newHistory = searchHistory.filter(h => h.query !== historyItem.query)
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(newHistory))
    setSearchHistory(newHistory)
  }

  const getTabCount = () => {
    if (activeTab === 'all') return results.length
    return results.filter(r => r.type === activeTab.slice(0, -1)).length
  }

  const tabs = [
    { id: 'all', label: '전체' },
    { id: 'projects', label: '프로젝트' },
    { id: 'tags', label: '태그' },
    { id: 'departments', label: '부서' },
  ]

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleSearch()
            } else if (e.key === 'Escape') {
              setIsOpen(false)
            }
          }}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('')
              setResults([])
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Search Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-96 overflow-hidden flex flex-col">
          {!query ? (
            <>
              {/* Tabs (only when no query) */}
              <div className="flex border-b border-gray-200">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex-1 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="overflow-y-auto flex-1 p-4">
                {/* Search History */}
                {searchHistory.length > 0 && (
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        최근 검색
                      </h4>
                      <button
                        onClick={() => {
                          clearSearchHistory()
                          setSearchHistory([])
                        }}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        삭제
                      </button>
                    </div>
                    <div className="space-y-1">
                      {searchHistory.slice(0, 5).map((item) => (
                        <button
                          key={item.query}
                          onClick={() => handleHistoryClick(item)}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-100 group"
                        >
                          <span className="text-sm text-gray-700">{item.query}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRemoveHistory(item)
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-600"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Popular Searches */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-3">
                    <TrendingUp className="w-4 h-4" />
                    인기 검색어
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {POPULAR_SEARCHES.map((term) => (
                      <button
                        key={term}
                        onClick={() => handlePopularClick(term)}
                        className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200"
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Tabs */}
              <div className="flex border-b border-gray-200">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex-1 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab.label}
                    {getTabCount() > 0 && (
                      <span className="ml-1 text-xs text-gray-400">({getTabCount()})</span>
                    )}
                  </button>
                ))}
              </div>

              <div className="overflow-y-auto flex-1">
                {isSearching ? (
                  <div className="p-8 text-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                  </div>
                ) : results.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <Search className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p>검색 결과가 없습니다</p>
                    <p className="text-sm mt-1">다른 검색어를 시도해보세요.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {results.map((result) => {
                      const isProject = result.type === 'project'
                      return (
                        <button
                          key={result.id}
                          onClick={() => handleResultClick(result)}
                          className="w-full flex items-start gap-3 p-4 hover:bg-gray-50 text-left"
                        >
                          <div className={`p-2 rounded-lg ${
                            result.type === 'project' ? 'bg-blue-100 text-blue-600' :
                            result.type === 'tag' ? 'bg-green-100 text-green-600' :
                            'bg-purple-100 text-purple-600'
                          }`}>
                            {result.type === 'project' ? (
                              <Search className="w-4 h-4" />
                            ) : (
                              <Tag className="w-4 h-4" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 truncate">{result.title}</p>
                            {result.subtitle && (
                              <p className="text-sm text-gray-500">{result.subtitle}</p>
                            )}
                            {isProject && result.tags && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {result.tags.slice(0, 3).map((tag) => (
                                  <span key={tag} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          {isProject && result.stars !== undefined && (
                            <span className="text-sm text-gray-500">⭐ {result.stars}</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Footer */}
          <div className="p-3 border-t border-gray-200 flex justify-between items-center">
            <div className="text-xs text-gray-500">
              {query ? (
                <span>
                  <kbd className="px-1 py-0.5 bg-gray-100 rounded">Enter</kbd> 검색
                  <span className="mx-1">·</span>
                  <kbd className="px-1 py-0.5 bg-gray-100 rounded">Esc</kbd> 닫기
                </span>
              ) : (
                <span>검색어를 입력하세요</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
