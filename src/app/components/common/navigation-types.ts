import type { ReactNode } from 'react'

export interface NavigationItem<TId extends string = string> {
  id: TId
  label: string
  icon?: ReactNode
  badge?: number
  locked?: boolean
  lockHint?: string
}

export interface NavigationSection<TId extends string = string> {
  title?: string
  items: NavigationItem<TId>[]
}
