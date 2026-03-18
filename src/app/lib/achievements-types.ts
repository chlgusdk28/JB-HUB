export type AchievementCategory =
  | 'exploration'
  | 'engagement'
  | 'social'
  | 'milestone'
  | 'level'
  | 'xp'
  | 'quest'
  | 'special'

export type AchievementRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic'

export interface AchievementDefinition {
  id: string
  title: string
  description: string
  icon: string
  category: AchievementCategory
  rarity: AchievementRarity
  max: number
  tier: number
}

export interface Achievement extends AchievementDefinition {
  progress: number
  unlockedAt?: string
  reward?: string
}

export interface AchievementProgress {
  [key: string]: number
}

export interface AchievementStorage {
  [key: string]: {
    progress?: number
    unlockedAt?: string
  }
}
