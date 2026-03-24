export type Theme = 'light' | 'dark' | 'auto'
export type Language = 'ko' | 'en'
export type Density = 'comfortable' | 'compact'

export interface UserSettingsState {
  theme: Theme
  language: Language
  density: Density
  notifications: {
    email: boolean
    push: boolean
    projectUpdates: boolean
    newComments: boolean
    trending: boolean
  }
  privacy: {
    profilePublic: boolean
    showActivity: boolean
    showBookmarks: boolean
  }
}

const STORAGE_KEY = 'jb-hub:user-settings'

export const DEFAULT_USER_SETTINGS: UserSettingsState = {
  theme: 'light',
  language: 'ko',
  density: 'comfortable',
  notifications: {
    email: true,
    push: true,
    projectUpdates: true,
    newComments: true,
    trending: false,
  },
  privacy: {
    profilePublic: false,
    showActivity: true,
    showBookmarks: true,
  },
}

export function mergeUserSettings(candidate: Partial<UserSettingsState> | null | undefined): UserSettingsState {
  const next = candidate ?? {}

  return {
    ...DEFAULT_USER_SETTINGS,
    ...next,
    notifications: {
      ...DEFAULT_USER_SETTINGS.notifications,
      ...next.notifications,
    },
    privacy: {
      ...DEFAULT_USER_SETTINGS.privacy,
      ...next.privacy,
    },
  }
}

export function applyTheme(theme: Theme) {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return
  }

  if (theme === 'dark') {
    document.documentElement.classList.add('dark')
    return
  }

  if (theme === 'light') {
    document.documentElement.classList.remove('dark')
    return
  }

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.classList.toggle('dark', prefersDark)
}

export function applyUserSettings(settings: UserSettingsState) {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = settings.language
    document.documentElement.dataset.jbDensity = settings.density
    document.documentElement.dataset.jbLanguage = settings.language
  }

  applyTheme(settings.theme)
}

export function loadUserSettings(): UserSettingsState {
  if (typeof window === 'undefined') {
    return DEFAULT_USER_SETTINGS
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return mergeUserSettings(stored ? (JSON.parse(stored) as Partial<UserSettingsState>) : undefined)
  } catch {
    return DEFAULT_USER_SETTINGS
  }
}

export function saveUserSettings(settings: UserSettingsState) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    applyUserSettings(settings)
  } catch (error) {
    console.error('Failed to save settings:', error)
  }
}
