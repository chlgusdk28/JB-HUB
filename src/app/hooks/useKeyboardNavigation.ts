import { useEffect } from 'react'

interface Shortcut {
  key: string
  ctrlKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
  metaKey?: boolean
  action: () => void
  description?: string
}

export function useKeyboardNavigation(shortcuts: Shortcut[]) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        const match =
          e.key.toLowerCase() === shortcut.key.toLowerCase() &&
          (shortcut.ctrlKey === undefined || e.ctrlKey === shortcut.ctrlKey) &&
          (shortcut.shiftKey === undefined || e.shiftKey === shortcut.shiftKey) &&
          (shortcut.altKey === undefined || e.altKey === shortcut.altKey) &&
          (shortcut.metaKey === undefined || e.metaKey === shortcut.metaKey)

        if (match) {
          e.preventDefault()
          shortcut.action()
          return
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [shortcuts])
}

export function useArrowNavigation(options: {
  onUp?: () => void
  onDown?: () => void
  onLeft?: () => void
  onRight?: () => void
  onEnter?: () => void
  onEscape?: () => void
  isEnabled?: boolean
}) {
  const {
    onUp,
    onDown,
    onLeft,
    onRight,
    onEnter,
    onEscape,
    isEnabled = true,
  } = options

  useEffect(() => {
    if (!isEnabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault()
          onUp?.()
          break
        case 'ArrowDown':
          e.preventDefault()
          onDown?.()
          break
        case 'ArrowLeft':
          e.preventDefault()
          onLeft?.()
          break
        case 'ArrowRight':
          e.preventDefault()
          onRight?.()
          break
        case 'Enter':
          e.preventDefault()
          onEnter?.()
          break
        case 'Escape':
          e.preventDefault()
          onEscape?.()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onUp, onDown, onLeft, onRight, onEnter, onEscape, isEnabled])
}
