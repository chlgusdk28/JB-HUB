import { useEffect } from 'react'

export type ShortcutHandler = () => void

export interface KeyboardShortcuts {
  [key: string]: ShortcutHandler
}

interface ShortcutEvent {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}

function isShortcutMatch(event: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.toLowerCase().split('+')
  const key = parts.pop() || ''

  const hasCtrl = parts.includes('ctrl') || parts.includes('cmd')
  const hasShift = parts.includes('shift')
  const hasAlt = parts.includes('alt')

  const eventKey = event.key.toLowerCase()

  return (
    eventKey === key &&
    !!event.ctrlKey === hasCtrl &&
    !!event.metaKey === hasCtrl &&
    !!event.shiftKey === hasShift &&
    !!event.altKey === hasAlt
  )
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcuts, enabled = true) {
  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if user is typing in an input
      const target = event.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.contentEditable === 'true' ||
        target.closest('[contenteditable="true"]')
      ) {
        return
      }

      for (const [shortcut, handler] of Object.entries(shortcuts)) {
        if (isShortcutMatch(event, shortcut)) {
          event.preventDefault()
          handler()
          break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [shortcuts, enabled])
}

// Common shortcuts constants
export const SHORTCUTS = {
  SEARCH: 'ctrl+k',
  SEARCH_ALT: 'cmd+k',
  HOME: 'ctrl+shift+h',
  HOME_ALT: 'cmd+shift+h',
  NEW_PROJECT: 'ctrl+n',
  NEW_PROJECT_ALT: 'cmd+n',
  THEME: 'ctrl+shift+t',
  THEME_ALT: 'cmd+shift+t',
  HELP: '?',
  ESCAPE: 'escape',
  ARROW_DOWN: 'arrowdown',
  ARROW_UP: 'arrowup',
  ENTER: 'enter',
} as const
