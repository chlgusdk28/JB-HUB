import { useState, useEffect, useMemo } from 'react'
import {
  Trophy,
  Target,
  Flame,
  Star,
  Zap,
  Heart,
  Rocket,
  Award,
  Compass,
  Users,
  Calendar,
  TrendingUp,
  Crown,
  Sparkles,
  Filter,
  CheckCircle2,
  Lock,
  User,
} from 'lucide-react'
import {
  loadFilteredAchievements,
  getAchievementStats,
  syncAchievementStats,
  type Achievement,
  type AchievementCategory,
  type AchievementRarity,
} from '../../lib/achievements-utils'

// 스팀 스타일: 업적별 달성자 수 시뮬레이션
// 실제로는 서버에서 전체 사용자 데이터를 기반으로 계산해야 함
function getAchievementCompletionRate(achievementId: string): { percentage: number; label: string } {
  // 업적 ID 기반으로 일관된 난수 생성 (실제 구현 시 서버 데이터 사용)
  const hash = achievementId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)

  // 티어와 ID에 따른 달성률 계산
  const tier = parseInt(achievementId.split('_').pop() || '1', 10)

  let baseRate = 80 // 기본 달성률
  if (achievementId.includes('mythic') || tier >= 500) baseRate = 0.1
  else if (achievementId.includes('legendary') || tier >= 200) baseRate = 0.5
  else if (achievementId.includes('epic') || tier >= 100) baseRate = 2
  else if (achievementId.includes('rare') || tier >= 50) baseRate = 5
  else if (achievementId.includes('level_') || achievementId.includes('xp_')) {
    if (tier >= 500) baseRate = 0.05
    else if (tier >= 200) baseRate = 0.2
    else if (tier >= 100) baseRate = 1
    else if (tier >= 50) baseRate = 3
    else baseRate = 10
  } else if (achievementId.includes('streak_')) {
    if (tier >= 365) baseRate = 0.01
    else if (tier >= 100) baseRate = 0.1
    else if (tier >= 30) baseRate = 1
    else baseRate = 15
  } else if (achievementId.includes('visited_')) {
    if (tier >= 3650) baseRate = 0.001 // 100년
    else if (tier >= 365) baseRate = 0.5
    else baseRate = 20
  }

  // 해시를 이용한 약간의 변화
  const variation = (hash % 20) - 10
  const percentage = Math.max(0.001, Math.min(99.9, baseRate + variation * 0.1))

  // 라벨 생성
  let label = ''
  if (percentage >= 50) label = '흔함'
  else if (percentage >= 20) label = '보통'
  else if (percentage >= 5) label = '희귀'
  else if (percentage >= 1) label = '매우 희귀'
  else if (percentage >= 0.1) label = '초희귀'
  else label = '전설급'

  return { percentage, label }
}

// 희귀도별 설정
const RARITY_CONFIG: Record<
  AchievementRarity,
  { color: string; bgColor: string; textColor: string; borderColor: string; gradient: string }
> = {
  common: {
    color: 'from-slate-400 to-slate-500',
    bgColor: 'bg-gradient-to-br from-slate-50 to-slate-100',
    textColor: 'text-slate-700',
    borderColor: 'border-slate-200',
    gradient: 'from-slate-400 to-slate-500',
  },
  rare: {
    color: 'from-[#7f97b0] to-[#5f7f9f]',
    bgColor: 'bg-gradient-to-br from-sky-50 to-sky-100',
    textColor: 'text-sky-700',
    borderColor: 'border-sky-200',
    gradient: 'from-sky-400 to-sky-500',
  },
  epic: {
    color: 'from-[#5f7f9f] to-[#315779]',
    bgColor: 'bg-gradient-to-br from-blue-50 to-indigo-100',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-200',
    gradient: 'from-blue-500 to-indigo-600',
  },
  legendary: {
    color: 'from-amber-400 to-orange-500',
    bgColor: 'bg-gradient-to-br from-amber-50 to-orange-100',
    textColor: 'text-amber-700',
    borderColor: 'border-amber-300',
    gradient: 'from-amber-400 to-orange-500',
  },
  mythic: {
    color: 'from-purple-400 via-pink-500 to-rose-500',
    bgColor: 'bg-gradient-to-br from-purple-50 to-pink-100',
    textColor: 'text-purple-700',
    borderColor: 'border-purple-300',
    gradient: 'from-purple-400 via-pink-500 to-rose-500',
  },
}

// 카테고리 설정
const CATEGORIES: {
  value: AchievementCategory | 'all'
  label: string
  icon: any
  color: string
}[] = [
  { value: 'all', label: '전체', icon: Trophy, color: 'text-slate-600' },
  { value: 'exploration', label: '탐색', icon: Compass, color: 'text-emerald-600' },
  { value: 'engagement', label: '참여', icon: Star, color: 'text-blue-600' },
  { value: 'social', label: '소셜', icon: Heart, color: 'text-pink-600' },
  { value: 'milestone', label: '마일스톤', icon: Calendar, color: 'text-amber-600' },
  { value: 'level', label: '레벨', icon: TrendingUp, color: 'text-violet-600' },
  { value: 'xp', label: '경험치', icon: Sparkles, color: 'text-cyan-600' },
  { value: 'quest', label: '퀘스트', icon: Target, color: 'text-rose-600' },
  { value: 'special', label: '특별', icon: Crown, color: 'text-purple-600' },
]

// 희귀도 필터
const RARITIES: {
  value: AchievementRarity | 'all'
  label: string
  color: string
}[] = [
  { value: 'all', label: '전체', color: 'text-slate-600' },
  { value: 'common', label: '커먼', color: 'text-slate-500' },
  { value: 'rare', label: '레어', color: 'text-sky-500' },
  { value: 'epic', label: '에픽', color: 'text-blue-500' },
  { value: 'legendary', label: '레전', color: 'text-amber-500' },
  { value: 'mythic', label: '미식', color: 'text-purple-500' },
]

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
  const [sortBy, setSortBy] = useState<'tier' | 'progress' | 'unlocked' | 'completion'>('tier')

  // 레벨과 XP 업데이트
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

  // 업적 로드
  useEffect(() => {
    const load = () => {
      const filtered = loadFilteredAchievements(
        selectedCategory === 'all' ? undefined : selectedCategory,
        selectedRarity === 'all' ? undefined : selectedRarity,
        showUnlockedOnly
      )
      setAchievements(filtered)
    }
    load()

    // 주기적으로 리로드
  }, [
    selectedCategory,
    selectedRarity,
    showUnlockedOnly,
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

  // 정렬된 업적
  const sortedAchievements = useMemo(() => {
    const sorted = [...achievements]
    switch (sortBy) {
      case 'tier':
        return sorted.sort((a, b) => b.tier - a.tier)
      case 'progress':
        return sorted.sort((a, b) => b.progress - a.progress)
      case 'completion':
        return sorted.sort((a, b) => {
          const rateA = getAchievementCompletionRate(a.id).percentage
          const rateB = getAchievementCompletionRate(b.id).percentage
          return rateA - rateB
        })
      case 'unlocked':
        return sorted.sort((a, b) => {
          const aUnlocked = a.progress >= a.max
          const bUnlocked = b.progress >= b.max
          if (aUnlocked && !bUnlocked) return -1
          if (!aUnlocked && bUnlocked) return 1
          return b.tier - a.tier
        })
      default:
        return sorted
    }
  }, [achievements, sortBy])

  // 통계
  const stats = useMemo(() => getAchievementStats(), [achievements])

  const completionRate = Math.round((stats.unlocked / stats.total) * 100)

  const getRarityConfig = (rarity: AchievementRarity) => RARITY_CONFIG[rarity]

  return (
    <div className="space-y-6 pb-20 pt-8">
      {/* 헤더 */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 sm:p-8">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 p-3">
              <Trophy className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white sm:text-3xl">업적 도감</h1>
              <p className="text-slate-300">
                {stats.unlocked} / {stats.total}개 해금 ({completionRate}%)
              </p>
            </div>
          </div>

          {/* 통계 카드 */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-white/10 p-4 backdrop-blur-sm">
              <Trophy className="mb-2 h-5 w-5 text-amber-400" />
              <div className="text-xl font-bold text-white">{stats.unlocked}</div>
              <div className="text-xs text-slate-300">해금 완료</div>
            </div>
            <div className="rounded-xl bg-white/10 p-4 backdrop-blur-sm">
              <Flame className="mb-2 h-5 w-5 text-orange-400" />
              <div className="text-xl font-bold text-white">{stats.inProgress}</div>
              <div className="text-xs text-slate-300">진행 중</div>
            </div>
            <div className="rounded-xl bg-white/10 p-4 backdrop-blur-sm">
              <Lock className="mb-2 h-5 w-5 text-slate-400" />
              <div className="text-xl font-bold text-white">{stats.total - stats.unlocked - stats.inProgress}</div>
              <div className="text-xs text-slate-300">잠김</div>
            </div>
            <div className="rounded-xl bg-white/10 p-4 backdrop-blur-sm">
              <Zap className="mb-2 h-5 w-5 text-yellow-400" />
              <div className="text-xl font-bold text-white">{completionRate}%</div>
              <div className="text-xs text-slate-300">완료율</div>
            </div>
          </div>

          {completionRate < 100 && (
            <div className="mt-4 rounded-xl bg-white/5 p-3 backdrop-blur-sm">
              <p className="text-xs text-slate-300">
                🎯 전체 해금까지 약 <span className="font-semibold text-white">
                  {completionRate > 0 ? Math.round(100 / completionRate) : 100}년
                </span> 예상 (100년 완료 도전!)
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 필터 */}
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Filter className="h-4 w-4" />
          필터
        </div>

        {/* 카테고리 필터 */}
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon
            const isActive = selectedCategory === cat.value
            return (
              <button
                key={cat.value}
                onClick={() => setSelectedCategory(cat.value)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                  isActive
                    ? 'border-slate-800 bg-slate-800 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {cat.label}
              </button>
            )
          })}
        </div>

        {/* 추가 필터 */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedRarity}
            onChange={(e) => setSelectedRarity(e.target.value as AchievementRarity | 'all')}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600"
          >
            {RARITIES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600"
          >
            <option value="tier">티어순</option>
            <option value="progress">진행률순</option>
            <option value="completion">달성률순</option>
            <option value="unlocked">해금순</option>
          </select>

          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={showUnlockedOnly}
              onChange={(e) => setShowUnlockedOnly(e.target.checked)}
              className="rounded border-slate-300"
            />
            해금된 것만
          </label>
        </div>
      </div>

      {/* 업적 그리드 */}
      {sortedAchievements.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortedAchievements.map((achievement) => {
            const config = getRarityConfig(achievement.rarity)
            const isUnlocked = achievement.progress >= achievement.max
            const progressPercent = Math.min((achievement.progress / achievement.max) * 100, 100)
            const completionRate = getAchievementCompletionRate(achievement.id)

            return (
              <div
                key={achievement.id}
                className={`group relative overflow-hidden rounded-2xl border-2 transition-all hover:shadow-lg ${
                  isUnlocked ? config.borderColor : 'border-slate-200'
                } ${config.bgColor}`}
              >
                {/* 희귀도 표시 */}
                <div className={`absolute top-0 right-0 h-16 w-16 bg-gradient-to-bl ${config.gradient} opacity-20`} />

                <div className="relative p-4">
                  {/* 헤더 */}
                  <div className="flex items-start gap-3">
                    {/* 아이콘 */}
                    <div
                      className={`text-3xl transition-transform group-hover:scale-110 ${
                        isUnlocked ? '' : 'grayscale opacity-50'
                      }`}
                    >
                      {achievement.icon}
                    </div>

                    {/* 내용 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className={`text-sm font-bold ${config.textColor}`}>
                          {achievement.title}
                        </h4>
                        <span className="rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          T{achievement.tier}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-600">{achievement.description}</p>

                      {/* 희귀도 태그 */}
                      <div className="mt-1 flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full ${config.borderColor} border bg-white/80 px-2 py-0.5 text-[10px] font-medium ${config.textColor}`}
                        >
                          {achievement.rarity.toUpperCase()}
                        </span>
                        {/* 스팀 스타일: 달성률 표시 */}
                        <span className="text-[10px] text-slate-500">
                          {completionRate.label} ({completionRate.percentage.toFixed(1)}%)
                        </span>
                      </div>
                    </div>

                    {/* 상태 아이콘 */}
                    <div className="flex-shrink-0">
                      {isUnlocked ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : (
                        <Lock className="h-5 w-5 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {/* 진행 바 */}
                  {!isUnlocked && achievement.max > 1 && (
                    <div className="mt-3">
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="text-slate-500">진행률</span>
                        <span className={`font-medium ${config.textColor}`}>
                          {achievement.progress} / {achievement.max}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className={`h-full bg-gradient-to-r ${config.gradient} transition-all duration-300`}
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                      <div className="mt-1 text-right text-[10px] text-slate-500">{progressPercent.toFixed(0)}%</div>
                    </div>
                  )}

                  {/* 해금 날짜 */}
                  {isUnlocked && achievement.unlockedAt && (
                    <div className="mt-3 rounded-lg bg-white/80 px-2 py-1.5 text-[10px] text-slate-500">
                      🎉 {new Date(achievement.unlockedAt).toLocaleDateString('ko-KR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}에 해금
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 py-16">
          <Trophy className="mb-4 h-16 w-16 text-slate-300" />
          <p className="text-slate-500">표시할 업적이 없습니다.</p>
        </div>
      )}
    </div>
  )
}

export default UserAchievements
