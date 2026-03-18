import { useEffect, useState } from 'react'

const MEDIA_QUERY = '(prefers-color-scheme: dark)'
const STORAGE_KEY = 'jbhub-theme'

export type Theme = 'light' | 'dark' | 'system'

export function useDarkMode() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return (stored === 'light' || stored === 'dark' || stored === 'system') ? stored : 'system'
  })

  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return false
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light') return false
    if (stored === 'dark') return true
    return window.matchMedia(MEDIA_QUERY).matches
  })

  useEffect(() => {
    const root = document.documentElement
    const mediaQuery = window.matchMedia(MEDIA_QUERY)

    const updateDarkMode = (dark: boolean) => {
      setIsDark(dark)
      if (dark) {
        root.classList.add('dark')
      } else {
        root.classList.remove('dark')
      }
    }

    const applyTheme = () => {
      if (theme === 'system') {
        updateDarkMode(mediaQuery.matches)
      } else {
        updateDarkMode(theme === 'dark')
      }
    }

    applyTheme()

    const handler = (e: MediaQueryListEvent) => {
      if (theme === 'system') {
        updateDarkMode(e.matches)
      }
    }

    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [theme])

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme)
    localStorage.setItem(STORAGE_KEY, newTheme)
  }

  const toggle = () => {
    if (isDark) {
      setTheme('light')
    } else {
      setTheme('dark')
    }
  }

  return { isDark, theme, setTheme, toggle }
}
