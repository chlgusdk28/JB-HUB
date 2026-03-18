import { useEffect } from 'react'

const FILTER_STORAGE_KEY = 'jbhub-explore-filters'

export interface StoredFilters {
  category?: string
  techStack?: string[]
  department?: string | null
  sortBy?: string
}

export function useFilterPersistence<T extends Record<string, any>>(
  filters: T,
  onFiltersChange: (filters: T) => void
) {
  // Load saved filters on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(FILTER_STORAGE_KEY)
      if (stored) {
        const savedFilters = JSON.parse(stored) as Partial<T>
        // Only restore if we have stored values
        if (Object.keys(savedFilters).length > 0) {
          onFiltersChange({ ...filters, ...savedFilters })
        }
      }
    } catch {
      // Ignore storage errors
    }
  }, [])

  // Save filters whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters))
    } catch {
      // Ignore storage errors
    }
  }, [filters])
}

export function clearStoredFilters() {
  try {
    localStorage.removeItem(FILTER_STORAGE_KEY)
  } catch {
    // Ignore storage errors
  }
}
