import { ALL_ACHIEVEMENTS } from './achievements-data'
import type { Achievement, AchievementCategory, AchievementRarity, AchievementStorage } from './achievements-types'

const STORAGE_KEY = 'jb-hub:achievements-v2'
const PROGRESS_KEY = 'jb-hub:achievements-progress'

export interface AchievementStats {
  projectsViewed: number
  bookmarksCount: number
  commentsCount: number
  likesCount: number
  sharesCount: number
  departmentsExplored: string[]
  currentStreak: number
  totalDaysActive: number
  currentLevel: number
  totalXp: number
  questsCompleted: number
}

export interface AchievementEvent {
  type: 'project_view' | 'bookmark' | 'comment' | 'like' | 'share' | 'login' | 'quest_complete'
  amount?: number
  department?: string
}

const EMPTY_STATS: AchievementStats = {
  projectsViewed: 0,
  bookmarksCount: 0,
  commentsCount: 0,
  likesCount: 0,
  sharesCount: 0,
  departmentsExplored: [],
  currentStreak: 0,
  totalDaysActive: 0,
  currentLevel: 0,
  totalXp: 0,
  questsCompleted: 0,
}

function normalizeAchievementStats(candidate: Partial<AchievementStats> | null | undefined): AchievementStats {
  const next = candidate ?? {}
  const departmentsExplored = Array.isArray(next.departmentsExplored)
    ? Array.from(
        new Set(
          next.departmentsExplored
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim())
            .filter((value) => value.length > 0),
        ),
      )
    : []

  return {
    ...EMPTY_STATS,
    ...next,
    projectsViewed: Number.isFinite(next.projectsViewed) ? Math.max(0, Math.floor(next.projectsViewed)) : 0,
    bookmarksCount: Number.isFinite(next.bookmarksCount) ? Math.max(0, Math.floor(next.bookmarksCount)) : 0,
    commentsCount: Number.isFinite(next.commentsCount) ? Math.max(0, Math.floor(next.commentsCount)) : 0,
    likesCount: Number.isFinite(next.likesCount) ? Math.max(0, Math.floor(next.likesCount)) : 0,
    sharesCount: Number.isFinite(next.sharesCount) ? Math.max(0, Math.floor(next.sharesCount)) : 0,
    departmentsExplored,
    currentStreak: Number.isFinite(next.currentStreak) ? Math.max(0, Math.floor(next.currentStreak)) : 0,
    totalDaysActive: Number.isFinite(next.totalDaysActive) ? Math.max(0, Math.floor(next.totalDaysActive)) : 0,
    currentLevel: Number.isFinite(next.currentLevel) ? Math.max(0, Math.floor(next.currentLevel)) : 0,
    totalXp: Number.isFinite(next.totalXp) ? Math.max(0, Math.floor(next.totalXp)) : 0,
    questsCompleted: Number.isFinite(next.questsCompleted) ? Math.max(0, Math.floor(next.questsCompleted)) : 0,
  }
}

// 스토리지에서 업적 데이터 로드
export function loadAchievementStorage(): AchievementStorage {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

// 스토리지에 업적 데이터 저장
function saveAchievementStorage(storage: AchievementStorage): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storage))
  } catch (e) {
    console.error('Failed to save achievements:', e)
  }
}

// 진행 상황 로드
export function loadAchievementProgress(): AchievementStats {
  try {
    const stored = localStorage.getItem(PROGRESS_KEY)
    return normalizeAchievementStats(stored ? JSON.parse(stored) : {})
  } catch {
    return { ...EMPTY_STATS }
  }
}

// 진행 상황 저장
function saveAchievementProgress(stats: AchievementStats): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(normalizeAchievementStats(stats)))
  } catch (e) {
    console.error('Failed to save progress:', e)
  }
}

// 업적 진행 상황 업데이트
export function updateAchievementProgress(event: AchievementEvent): Achievement[] {
  const storage = loadAchievementStorage()
  const stats = loadAchievementProgress()
  const amount = event.amount ?? 1

  // 통계 업데이트
  switch (event.type) {
    case 'project_view':
      stats.projectsViewed += amount
      if (typeof event.department === 'string') {
        const normalizedDepartment = event.department.trim()
        if (normalizedDepartment.length > 0 && !stats.departmentsExplored.includes(normalizedDepartment)) {
          stats.departmentsExplored = [...stats.departmentsExplored, normalizedDepartment]
        }
      }
      break
    case 'bookmark':
      stats.bookmarksCount += amount
      break
    case 'comment':
      stats.commentsCount += amount
      break
    case 'like':
      stats.likesCount += amount
      break
    case 'share':
      stats.sharesCount += amount
      break
    case 'quest_complete':
      stats.questsCompleted += amount
      break
    case 'login':
      stats.totalDaysActive += amount
      break
  }

  saveAchievementProgress(stats)

  // 업적 진행 상황 계산
  const achievementsWithProgress = ALL_ACHIEVEMENTS.map((def) => {
    const saved = storage[def.id] || {}
    let progress = saved.progress || 0

    // 업적별 진행 상황 계산
    switch (def.id) {
      case 'first_view':
      case 'explorer_10':
      case 'explorer_25':
      case 'explorer_50':
      case 'explorer_100':
      case 'explorer_200':
      case 'explorer_500':
      case 'explorer_1000':
      case 'explorer_2500':
      case 'explorer_5000':
      case 'explorer_10000':
        progress = Math.min(stats.projectsViewed, def.max)
        break

      case 'dept_1_first':
      case 'dept_5_first':
      case 'dept_all':
        progress = Math.min(stats.departmentsExplored.length, def.max)
        break

      case 'first_bookmark':
      case 'collector_5':
      case 'collector_10':
      case 'collector_25':
      case 'collector_50':
      case 'collector_100':
      case 'collector_200':
      case 'collector_500':
      case 'collector_1000':
        progress = Math.min(stats.bookmarksCount, def.max)
        break

      case 'first_comment':
      case 'commenter_5':
      case 'commenter_10':
      case 'commenter_25':
      case 'commenter_50':
      case 'commenter_100':
      case 'commenter_200':
      case 'commenter_500':
      case 'commenter_1000':
        progress = Math.min(stats.commentsCount, def.max)
        break

      case 'first_like':
      case 'liker_10':
      case 'liker_50':
      case 'liker_100':
      case 'liker_500':
      case 'liker_1000':
        progress = Math.min(stats.likesCount, def.max)
        break

      case 'first_share':
      case 'sharer_5':
      case 'sharer_10':
      case 'sharer_25':
      case 'sharer_50':
      case 'sharer_100':
      case 'sharer_250':
        progress = Math.min(stats.sharesCount, def.max)
        break

      case 'streak_1':
      case 'streak_2':
      case 'streak_3':
      case 'streak_5':
      case 'streak_7':
      case 'streak_14':
      case 'streak_21':
      case 'streak_30':
      case 'streak_60':
      case 'streak_90':
      case 'streak_100':
      case 'streak_180':
      case 'streak_365':
      case 'streak_500':
      case 'streak_730':
      case 'streak_1000':
        progress = Math.min(stats.currentStreak, def.max)
        break

      case 'visited_1':
      case 'visited_7':
      case 'visited_30':
      case 'visited_90':
      case 'visited_180':
      case 'visited_365':
      case 'visited_730':
      case 'visited_1095':
      case 'visited_1825':
      case 'visited_3650':
      case 'visited_7300':
      case 'visited_10950':
      case 'visited_18250':
      case 'visited_36500':
        progress = Math.min(stats.totalDaysActive, def.max)
        break

      case 'level_5':
      case 'level_10':
      case 'level_25':
      case 'level_50':
      case 'level_75':
      case 'level_100':
      case 'level_150':
      case 'level_200':
      case 'level_300':
      case 'level_500':
      case 'level_1000':
        progress = Math.min(stats.currentLevel, def.max)
        break

      case 'xp_100':
      case 'xp_500':
      case 'xp_1000':
      case 'xp_5000':
      case 'xp_10000':
      case 'xp_25000':
      case 'xp_50000':
      case 'xp_100000':
      case 'xp_250000':
      case 'xp_500000':
      case 'xp_1000000':
        progress = Math.min(stats.totalXp, def.max)
        break

      case 'quest_1':
      case 'quest_7':
      case 'quest_30':
      case 'quest_100':
      case 'quest_365':
      case 'quest_500':
      case 'quest_1000':
        progress = Math.min(stats.questsCompleted, def.max)
        break

      default:
        progress = saved.progress || 0
    }

    const isUnlocked = progress >= def.max

    return {
      ...def,
      progress,
      unlockedAt: saved.unlockedAt,
    }
  })

  // 새로 해금된 업적 저장
  const newUnlocked = achievementsWithProgress.filter(
    (a) => a.progress >= a.max && !storage[a.id]?.unlockedAt
  )

  if (newUnlocked.length > 0) {
    const updatedStorage = { ...storage }
    newUnlocked.forEach((a) => {
      updatedStorage[a.id] = {
        ...updatedStorage[a.id],
        progress: a.progress,
        unlockedAt: new Date().toISOString(),
      }
    })
    saveAchievementStorage(updatedStorage)
  }

  return achievementsWithProgress
}

// 모든 업적 로드
export function loadAllAchievements(): Achievement[] {
  return updateAchievementProgress({ type: 'login', amount: 0 })
}

// 필터링된 업적 로드
export function loadFilteredAchievements(
  category?: AchievementCategory,
  rarity?: AchievementRarity,
  showUnlockedOnly?: boolean
): Achievement[] {
  const achievements = loadAllAchievements()

  return achievements.filter((a) => {
    if (category && a.category !== category) return false
    if (rarity && a.rarity !== rarity) return false
    if (showUnlockedOnly && a.progress < a.max) return false
    return true
  })
}

// 업적 통계
export function getAchievementStats() {
  const achievements = loadAllAchievements()

  return {
    total: achievements.length,
    unlocked: achievements.filter((a) => a.progress >= a.max).length,
    inProgress: achievements.filter((a) => a.progress > 0 && a.progress < a.max).length,
    byCategory: {
      exploration: achievements.filter((a) => a.category === 'exploration' && a.progress >= a.max).length,
      engagement: achievements.filter((a) => a.category === 'engagement' && a.progress >= a.max).length,
      social: achievements.filter((a) => a.category === 'social' && a.progress >= a.max).length,
      milestone: achievements.filter((a) => a.category === 'milestone' && a.progress >= a.max).length,
      level: achievements.filter((a) => a.category === 'level' && a.progress >= a.max).length,
      xp: achievements.filter((a) => a.category === 'xp' && a.progress >= a.max).length,
      quest: achievements.filter((a) => a.category === 'quest' && a.progress >= a.max).length,
      special: achievements.filter((a) => a.category === 'special' && a.progress >= a.max).length,
    },
    byRarity: {
      common: achievements.filter((a) => a.rarity === 'common' && a.progress >= a.max).length,
      rare: achievements.filter((a) => a.rarity === 'rare' && a.progress >= a.max).length,
      epic: achievements.filter((a) => a.rarity === 'epic' && a.progress >= a.max).length,
      legendary: achievements.filter((a) => a.rarity === 'legendary' && a.progress >= a.max).length,
      mythic: achievements.filter((a) => a.rarity === 'mythic' && a.progress >= a.max).length,
    },
  }
}

// 레벨과 XP 업데이트
export function updateLevelAndXp(level: number, xp: number): Achievement[] {
  return syncAchievementStats({
    currentLevel: level,
    totalXp: xp,
  })
}

// 스트릭 업데이트
export function updateStreak(streak: number): Achievement[] {
  return syncAchievementStats({
    currentStreak: streak,
  })
}

export function syncAchievementStats(snapshot: Partial<AchievementStats>): Achievement[] {
  const nextStats = normalizeAchievementStats({
    ...loadAchievementProgress(),
    ...snapshot,
  })
  saveAchievementProgress(nextStats)
  return updateAchievementProgress({ type: 'login', amount: 0 })
}

export function recordExploredDepartment(department: string): Achievement[] {
  if (typeof department !== 'string' || department.trim().length === 0) {
    return loadAllAchievements()
  }

  return syncAchievementStats({
    departmentsExplored: [...loadAchievementProgress().departmentsExplored, department],
  })
}

// 업적 점수 계산
export function getAchievementScore(): number {
  const stats = getAchievementStats()
  let score = 0

  stats.byRarity.common && (score += stats.byRarity.common * 1)
  stats.byRarity.rare && (score += stats.byRarity.rare * 5)
  stats.byRarity.epic && (score += stats.byRarity.epic * 20)
  stats.byRarity.legendary && (score += stats.byRarity.legendary * 100)
  stats.byRarity.mythic && (score += stats.byRarity.mythic * 500)

  return score
}

// 리셋 함수 (테스트용)
export function resetAchievements(): void {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(PROGRESS_KEY)
}
