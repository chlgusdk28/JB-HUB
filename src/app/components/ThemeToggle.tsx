import { Moon, Sun, Monitor } from 'lucide-react'
import { useDarkMode, type Theme } from '../hooks/useDarkMode'

interface ThemeToggleProps {
  className?: string
}

export function ThemeToggle({ className = '' }: ThemeToggleProps) {
  const { theme, setTheme } = useDarkMode()

  const themes: { value: Theme; icon: typeof Sun; label: string }[] = [
    { value: 'light', icon: Sun, label: '라이트 모드' },
    { value: 'dark', icon: Moon, label: '다크 모드' },
    { value: 'system', icon: Monitor, label: '시스템 설정' },
  ]

  const currentIndex = themes.findIndex((t) => t.value === theme)
  const nextTheme = themes[(currentIndex + 1) % themes.length]
  const NextIcon = nextTheme.icon

  return (
    <button
      onClick={() => setTheme(nextTheme.value)}
      className={`glass-icon-button ${className}`}
      title={nextTheme.label}
      aria-label={`테마 변경 (현재: ${themes[currentIndex].label})`}
    >
      <NextIcon className="h-4 w-4" />
    </button>
  )
}
