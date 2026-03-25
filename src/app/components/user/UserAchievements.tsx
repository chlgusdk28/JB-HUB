import { useEffect, useMemo, useState } from 'react'
import {
  Calendar,
  CheckCircle2,
  Compass,
  Crown,
  Filter,
  Heart,
  Lock,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import { PageHeader, PageShell, Pill } from '../common'
import {
  getAchievementScore,
  getAchievementStats,
  loadFilteredAchievements,
  syncAchievementStats,
  type Achievement,
  type AchievementCategory,
  type AchievementRarity,
} from '../../lib/achievements-utils'

type AchievementSort = 'tier' | 'progress' | 'unlocked' | 'completion'

interface UserAchievementsProps {
  projectsViewed?: number
  bookmarksCount?: number
  commentsCount?: number
  likesCount?: number
  sharesCount?: number
  daysActive?: number
  currentLevel?: number
  currentXp?: number
  currentStreak?: number
  questsCompleted?: number
}

const CATEGORY_OPTIONS: Array<{
  value: AchievementCategory | 'all'
  label: string
  icon: LucideIcon
}> = [
  { value: 'all', label: '전체', icon: Trophy },
  { value: 'exploration', label: '탐색', icon: Compass },
  { value: 'engagement', label: '참여', icon: Star },
  { value: 'social', label: '소셜', icon: Heart },
  { value: 'milestone', label: '마일스톤', icon: Calendar },
  { value: 'level', label: '레벨', icon: TrendingUp },
  { value: 'xp', label: '경험치', icon: Sparkles },
  { value: 'quest', label: '퀘스트', icon: Target },
  { value: 'special', label: '스페셜', icon: Crown },
]

const RARITY_LABELS: Record<AchievementRarity | 'all', string> = {
  all: '전체 등급',
  common: '커먼',
  rare: '레어',
  epic: '에픽',
  legendary: '레전더리',
  mythic: '미식',
}

const SORT_LABELS: Record<AchievementSort, string> = {
  tier: '티어 순',
  progress: '진행도 순',
  unlocked: '달성 여부',
  completion: '희소성 순',
}

const RARITY_STYLES: Record<
  AchievementRarity,
  { border: string; bg: string; text: string; accent: string }
> = {
  common: {
    border: 'border-slate-200',
    bg: 'bg-slate-50/90',
    text: 'text-slate-700',
    accent: 'bg-slate-400',
  },
  rare: {
    border: 'border-sky-200',
    bg: 'bg-sky-50/90',
    text: 'text-sky-700',
    accent: 'bg-sky-500',
  },
  epic: {
    border: 'border-blue-200',
    bg: 'bg-blue-50/90',
    text: 'text-blue-700',
    accent: 'bg-blue-600',
  },
  legendary: {
    border: 'border-amber-300',
    bg: 'bg-amber-50/90',
    text: 'text-amber-700',
    accent: 'bg-amber-500',
  },
  mythic: {
    border: 'border-pink-300',
    bg: 'bg-pink-50/90',
    text: 'text-pink-700',
    accent: 'bg-pink-500',
  },
}

function getCategoryLabel(category: AchievementCategory) {
  return CATEGORY_OPTIONS.find((option) => option.value === category)?.label ?? category
}

function getCategoryIcon(category: AchievementCategory) {
  return CATEGORY_OPTIONS.find((option) => option.value === category)?.icon ?? Trophy
}

function getAchievementCompletionMeta(achievementId: string) {
  const hash = achievementId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)
  const tier = Number.parseInt(achievementId.split('_').pop() || '1', 10)

  let baseRate = 80
  if (tier >= 500) baseRate = 0.1
  else if (tier >= 200) baseRate = 0.5
  else if (tier >= 100) baseRate = 2
  else if (tier >= 50) baseRate = 5
  else if (achievementId.startsWith('level_') || achievementId.startsWith('xp_')) {
    if (tier >= 500) baseRate = 0.05
    else if (tier >= 200) baseRate = 0.2
    else if (tier >= 100) baseRate = 1
    else if (tier >= 50) baseRate = 3
    else baseRate = 10
  } else if (achievementId.startsWith('streak_')) {
    if (tier >= 365) baseRate = 0.01
    else if (tier >= 100) baseRate = 0.1
    else if (tier >= 30) baseRate = 1
    else baseRate = 15
  } else if (achievementId.startsWith('visited_')) {
    if (tier >= 3650) baseRate = 0.001
    else if (tier >= 365) baseRate = 0.5
    else baseRate = 20
  }

  const percentage = Math.max(0.001, Math.min(99.9, baseRate + ((hash % 20) - 10) * 0.1))

  if (percentage >= 50) return { percentage, label: '흔함' }
  if (percentage >= 20) return { percentage, label: '보통' }
  if (percentage >= 5) return { percentage, label: '희귀' }
  if (percentage >= 1) return { percentage, label: '매우 희귀' }
  if (percentage >= 0.1) return { percentage, label: '초희귀' }
  return { percentage, label: '전설급' }
}

function getAchievementCopy(achievement: Achievement) {
  if (achievement.id === 'first_view') {
    return { title: '첫 프로젝트 탐색', description: '프로젝트를 처음 조회했습니다.' }
  }
  if (achievement.id.startsWith('explorer_')) {
    return {
      title: '프로젝트 탐색가',
      description: `프로젝트 ${achievement.max.toLocaleString()}개를 조회합니다.`,
    }
  }
  if (achievement.id.startsWith('dept_')) {
    return {
      title: '부서 횡단',
      description: `서로 다른 부서 ${achievement.max.toLocaleString()}개를 둘러봅니다.`,
    }
  }
  if (achievement.id === 'first_bookmark' || achievement.id.startsWith('collector_')) {
    return {
      title: '즐겨찾기 수집가',
      description: `프로젝트 ${achievement.max.toLocaleString()}개를 저장합니다.`,
    }
  }
  if (achievement.id === 'first_comment' || achievement.id.startsWith('commenter_')) {
    return {
      title: '대화 참여자',
      description: `댓글 ${achievement.max.toLocaleString()}개를 작성합니다.`,
    }
  }
  if (achievement.id === 'first_like' || achievement.id.startsWith('liker_')) {
    return {
      title: '좋아요 전도사',
      description: `좋아요 ${achievement.max.toLocaleString()}개를 남깁니다.`,
    }
  }
  if (achievement.id === 'first_share' || achievement.id.startsWith('sharer_')) {
    return {
      title: '공유 메신저',
      description: `공유 ${achievement.max.toLocaleString()}회를 달성합니다.`,
    }
  }
  if (achievement.id.startsWith('streak_')) {
    return {
      title: '연속 방문',
      description: `${achievement.max.toLocaleString()}일 연속으로 방문합니다.`,
    }
  }
  if (achievement.id.startsWith('visited_')) {
    return {
      title: '누적 출석',
      description: `누적 활동일 ${achievement.max.toLocaleString()}일을 채웁니다.`,
    }
  }
  if (achievement.id.startsWith('level_')) {
    return {
      title: '레벨 성장',
      description: `레벨 ${achievement.max.toLocaleString()}에 도달합니다.`,
    }
  }
  if (achievement.id.startsWith('xp_')) {
    return {
      title: '경험치 축적',
      description: `XP ${achievement.max.toLocaleString()}를 모읍니다.`,
    }
  }
  if (achievement.id.startsWith('quest_')) {
    return {
      title: '퀘스트 완료',
      description: `퀘스트 ${achievement.max.toLocaleString()}개를 완료합니다.`,
    }
  }

  return {
    title: `${getCategoryLabel(achievement.category)} 업적`,
    description: `목표값 ${achievement.max.toLocaleString()}를 달성합니다.`,
  }
}

function getUnlockStateLabel(achievement: Achievement) {
  if (achievement.progress >= achievement.max) {
    return '달성 완료'
  }
  if (achievement.progress > 0) {
    return '진행 중'
  }
  return '미달성'
}

export function UserAchievements({
  projectsViewed = 0,
  bookmarksCount = 0,
  commentsCount = 0,
  likesCount = 0,
  sharesCount = 0,
  daysActive = 0,
  currentLevel = 0,
  currentXp = 0,
  currentStreak = 0,
  questsCompleted = 0,
}: UserAchievementsProps) {
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [selectedCategory, setSelectedCategory] = useState<AchievementCategory | 'all'>('all')
  const [selectedRarity, setSelectedRarity] = useState<AchievementRarity | 'all'>('all')
  const [showUnlockedOnly, setShowUnlockedOnly] = useState(false)
  const [sortBy, setSortBy] = useState<AchievementSort>('tier')

  useEffect(() => {
    syncAchievementStats({
      projectsViewed,
      bookmarksCount,
      commentsCount,
      likesCount,
      sharesCount,
      totalDaysActive: daysActive,
      currentLevel,
      totalXp: currentXp,
      currentStreak,
      questsCompleted,
    })
  }, [
    bookmarksCount,
    commentsCount,
    currentLevel,
    currentStreak,
    currentXp,
    daysActive,
    likesCount,
    projectsViewed,
    questsCompleted,
    sharesCount,
  ])

  useEffect(() => {
    setAchievements(
      loadFilteredAchievements(
        selectedCategory === 'all' ? undefined : selectedCategory,
        selectedRarity === 'all' ? undefined : selectedRarity,
        showUnlockedOnly,
      ),
    )
  }, [
    bookmarksCount,
    commentsCount,
    currentLevel,
    currentStreak,
    currentXp,
    daysActive,
    likesCount,
    projectsViewed,
    questsCompleted,
    selectedCategory,
    selectedRarity,
    sharesCount,
    showUnlockedOnly,
  ])

  const sortedAchievements = useMemo(() => {
    const next = [...achievements]

    switch (sortBy) {
      case 'tier':
        return next.sort((left, right) => right.tier - left.tier)
      case 'progress':
        return next.sort((left, right) => right.progress - left.progress)
      case 'completion':
        return next.sort(
          (left, right) =>
            getAchievementCompletionMeta(left.id).percentage - getAchievementCompletionMeta(right.id).percentage,
        )
      case 'unlocked':
        return next.sort((left, right) => {
          const leftUnlocked = left.progress >= left.max
          const rightUnlocked = right.progress >= right.max

          if (leftUnlocked && !rightUnlocked) return -1
          if (!leftUnlocked && rightUnlocked) return 1
          return right.tier - left.tier
        })
      default:
        return next
    }
  }, [achievements, sortBy])

  const stats = useMemo(() => getAchievementStats(), [achievements])
  const achievementScore = useMemo(() => getAchievementScore(), [achievements])
  const completionRate = stats.total > 0 ? Math.round((stats.unlocked / stats.total) * 100) : 0
  const activeFilterCount =
    Number(selectedCategory !== 'all') + Number(selectedRarity !== 'all') + Number(showUnlockedOnly)

  return (
    <PageShell density="compact">
      <PageHeader
        variant="simple"
        eyebrow={
          <>
            <Trophy className="h-3.5 w-3.5" />
            Achievement Center
          </>
        }
        title="업적 센터"
        description="탐색, 참여, 퀘스트, 레벨 성장을 같은 카드 구조 안에서 비교할 수 있도록 정리한 개인 성과 보드입니다."
      />

      <section className="page-panel space-y-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="page-summary-strip">
            <div className="page-summary-item">
              <span className="page-summary-label">총 업적</span>
              <span className="page-summary-value">{stats.total}</span>
            </div>
            <div className="page-summary-item">
              <span className="page-summary-label">달성 완료</span>
              <span className="page-summary-value">{stats.unlocked}</span>
            </div>
            <div className="page-summary-item">
              <span className="page-summary-label">완료율</span>
              <span className="page-summary-value">{completionRate}%</span>
            </div>
            <div className="page-summary-item">
              <span className="page-summary-label">업적 점수</span>
              <span className="page-summary-value">{achievementScore.toLocaleString()}</span>
            </div>
          </div>
          <span className="page-toolbar-note">희소성, 진행률, 달성 상태를 같은 카드 문법 안에서 빠르게 비교할 수 있습니다.</span>
        </div>

        <div className="action-row action-row-scroll">
            {CATEGORY_OPTIONS.map((option) => {
              const Icon = option.icon
              const isActive = selectedCategory === option.value

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSelectedCategory(option.value)}
                  className={`chip-filter ${isActive ? 'chip-filter-active' : 'chip-filter-idle'}`}
                >
                  <Icon className="h-4 w-4" />
                  {option.label}
                </button>
              )
            })}
        </div>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="page-toolbar-cluster">
            <select
              value={selectedRarity}
              onChange={(event) => setSelectedRarity(event.target.value as AchievementRarity | 'all')}
              className="select-soft max-w-[12rem]"
            >
              {Object.entries(RARITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as AchievementSort)}
              className="select-soft max-w-[10rem]"
            >
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setShowUnlockedOnly((previous) => !previous)}
              className={`chip-filter ${showUnlockedOnly ? 'chip-filter-active' : 'chip-filter-idle'}`}
            >
              <Filter className="h-4 w-4" />
              완료만 보기
            </button>
          </div>
          <span className="page-toolbar-note">활성 필터 {activeFilterCount}개 · 표시 업적 {sortedAchievements.length}개</span>
        </div>
      </section>

      {sortedAchievements.length > 0 ? (
        <section className="page-card-grid">
          {sortedAchievements.map((achievement) => {
            const rarityStyle = RARITY_STYLES[achievement.rarity]
            const isUnlocked = achievement.progress >= achievement.max
            const progressPercent = Math.min((achievement.progress / achievement.max) * 100, 100)
            const completionMeta = getAchievementCompletionMeta(achievement.id)
            const copy = getAchievementCopy(achievement)
            const Icon = getCategoryIcon(achievement.category)
            const statusLabel = getUnlockStateLabel(achievement)

            return (
              <div
                key={achievement.id}
                className={`relative overflow-hidden rounded-[26px] border ${rarityStyle.border} ${rarityStyle.bg} p-5 shadow-[0_10px_24px_rgba(15,23,42,0.06)]`}
              >
                <div className={`absolute inset-x-0 top-0 h-1 ${rarityStyle.accent}`} />

                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <span className="project-section-icon">
                      <Icon className={`h-5 w-5 ${rarityStyle.text}`} />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-900">{copy.title}</h3>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${rarityStyle.bg} ${rarityStyle.text}`}
                        >
                          {RARITY_LABELS[achievement.rarity]}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
                          T{achievement.tier}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{copy.description}</p>
                    </div>

                    <span className="shrink-0">
                      {isUnlocked ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                      ) : (
                        <Lock className="h-5 w-5 text-slate-400" />
                      )}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Pill variant="subtle">상태: {statusLabel}</Pill>
                    <Pill variant="subtle">희소성 {completionMeta.label}</Pill>
                    <Pill variant="subtle">{getCategoryLabel(achievement.category)}</Pill>
                  </div>

                  {!isUnlocked ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>진행률</span>
                        <span>
                          {achievement.progress} / {achievement.max}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                        <div className={`h-full ${rarityStyle.accent}`} style={{ width: `${progressPercent}%` }} />
                      </div>
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>추정 달성률 {completionMeta.percentage.toFixed(1)}%</span>
                    {achievement.unlockedAt ? (
                      <span>{new Date(achievement.unlockedAt).toLocaleDateString('ko-KR')}</span>
                    ) : (
                      <span>미달성</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </section>
      ) : (
        <div className="empty-panel">
          <p className="text-sm text-slate-600">조건에 맞는 업적이 없습니다.</p>
          <p className="mt-2 text-xs text-slate-500">카테고리나 등급 필터를 조정해 다시 확인해 보세요.</p>
        </div>
      )}
    </PageShell>
  )
}

export default UserAchievements
