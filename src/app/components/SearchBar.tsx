import { useEffect, useRef, useState } from 'react'
import { Search, X, Clock, ArrowUpDown } from 'lucide-react'
import { useKeyboardShortcuts, SHORTCUTS } from '../hooks/useKeyboardShortcuts'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
}

const STORAGE_KEY = 'jbhub-recent-searches'
const MAX_RECENT = 5

function getRecentSearches(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function saveRecentSearch(searches: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(searches))
  } catch {
    // Ignore storage errors
  }
}

function addRecentSearch(query: string) {
  if (!query.trim()) return
  const searches = getRecentSearches()
  const filtered = searches.filter((s) => s !== query)
  const updated = [query, ...filtered].slice(0, MAX_RECENT)
  saveRecentSearch(updated)
}

export function SearchBar({
  value,
  onChange,
  placeholder = '검색...',
  className = '',
  autoFocus = false,
}: SearchBarProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setRecentSearches(getRecentSearches())
  }, [])

  // Keyboard shortcuts
  useKeyboardShortcuts(
    {
      [SHORTCUTS.SEARCH]: () => {
        inputRef.current?.focus()
        setIsOpen(true)
      },
      [SHORTCUTS.ESCAPE]: () => {
        if (isOpen) {
          setIsOpen(false)
          inputRef.current?.blur()
        }
      },
    },
    isOpen
  )

  const handleSubmit = () => {
    if (value.trim()) {
      addRecentSearch(value)
      setIsOpen(false)
    }
  }

  const handleRecentClick = (query: string) => {
    onChange(query)
    addRecentSearch(query)
    setIsOpen(false)
  }

  const clearRecent = () => {
    saveRecentSearch([])
    setRecentSearches([])
  }

  const showRecent = isOpen && recentSearches.length > 0 && !value

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleSubmit()
            } else if (e.key === 'ArrowDown' && showRecent) {
              e.preventDefault()
              // Focus first recent item
              const firstItem = document.querySelector('[data-recent-index="0"]') as HTMLElement
              firstItem?.focus()
            }
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={`
            w-full rounded-xl border border-slate-300/80 bg-white/90 pl-10 pr-10 py-2.5
            text-sm text-slate-700 outline-none ring-slate-200 transition
            focus:border-slate-500 focus:ring-2
            dark:bg-slate-800/90 dark:text-slate-200 dark:border-slate-600
            dark:focus:border-slate-400
          `}
        />
        {value && (
          <button
            onClick={() => onChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            aria-label="검색 지우기"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
          <kbd className="hidden sm:inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
            <span>⌘</span>K
          </kbd>
        </div>
      </div>

      {/* Recent searches dropdown */}
      {showRecent && (
        <div className="absolute z-50 mt-2 w-full rounded-xl surface-panel shadow-lg overflow-hidden">
          <div className="p-2">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">최근 검색</span>
              {recentSearches.length > 0 && (
                <button
                  onClick={clearRecent}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  지우기
                </button>
              )}
            </div>
            <div className="mt-1 space-y-0.5">
              {recentSearches.map((query, index) => (
                <button
                  key={query}
                  data-recent-index={String(index)}
                  onClick={() => handleRecentClick(query)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  <Clock className="h-3 w-3 text-slate-400" />
                  <span>{query}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Sort dropdown component
export function SortDropdown({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedOption = options.find((o) => o.value === value)

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-300/80 bg-white/90 text-sm text-slate-700 hover:bg-white transition-colors dark:bg-slate-800/90 dark:text-slate-200 dark:border-slate-600 dark:hover:bg-slate-700"
      >
        <ArrowUpDown className="h-4 w-4 text-slate-400" />
        <span>{selectedOption?.label || '정렬'}</span>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-xl surface-panel shadow-lg overflow-hidden">
          <div className="p-1">
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value)
                  setIsOpen(false)
                }}
                className={`w-full px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                  value === option.value
                    ? 'bg-slate-200 text-slate-900 dark:bg-slate-600 dark:text-white'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
