import { useEffect, useState } from 'react'

function isCompatibleType<T>(initialValue: T, candidate: unknown): candidate is T {
  if (Array.isArray(initialValue)) {
    return Array.isArray(candidate)
  }

  if (initialValue === null) {
    return candidate === null
  }

  const initialType = typeof initialValue

  if (initialType === 'object') {
    return typeof candidate === 'object' && candidate !== null
  }

  return typeof candidate === initialType
}

export function usePersistentState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue
    }

    try {
      const storedValue = window.localStorage.getItem(key)
      if (storedValue === null) {
        return initialValue
      }
      const parsed = JSON.parse(storedValue) as unknown
      return isCompatibleType(initialValue, parsed) ? parsed : initialValue
    } catch {
      return initialValue
    }
  })

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Intentionally ignored: localStorage may be unavailable in private mode.
    }
  }, [key, value])

  return [value, setValue] as const
}
