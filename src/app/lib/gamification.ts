export type GamificationMode = 'easy' | 'medium' | 'hard'

export type GamificationEvent =
  | 'session_visit'
  | 'login'
  | 'project_view'
  | 'favorite_add'
  | 'share'
  | 'discussion_create'
  | 'discussion_comment'
  | 'discussion_like'
  | 'project_create'

export interface DailyQuest {
  id: string
  title: string
  description: string
  descriptionEasy?: string  // 쉬움 모드용 상세 설명
  descriptionHard?: string  // 어려움 모드용 간결 설명
  event: GamificationEvent
  target: number
  rewardXp: number
}

export interface GuideText {
  title: string
  subtitle: string
  questTitle: string
  questDescription: string
  progressLabel: string
  completedLabel: string
  rewardLabel: string
  hint?: string
}

interface GamificationCounters {
  logins: number
  projectViews: number
  favoritesAdded: number
  shares: number
  discussionsCreated: number
  discussionComments: number
  discussionLikes: number
  projectsCreated: number
}

interface DailyProgress {
  date: string
  progress: Record<string, number>
  completed: string[]
}

export interface GamificationState {
  version: 1
  xp: number
  level: number
  totalActions: number
  streakDays: number
  longestStreakDays: number
  lastActiveDate: string | null
  activeDates: string[]
  counters: GamificationCounters
  daily: DailyProgress
}

export interface GamificationUpdate {
  state: GamificationState
  xpGained: number
  questRewardXp: number
  completedQuestIds: string[]
  completedQuestTitles: string[]
  levelUp: boolean
  previousLevel: number
  nextLevel: number
}

const XP_BY_EVENT: Record<GamificationEvent, number> = {
  session_visit: 3,
  login: 8,
  project_view: 5,
  favorite_add: 12,
  share: 15,
  discussion_create: 24,
  discussion_comment: 18,
  discussion_like: 4,
  project_create: 30,
}

const COUNTER_KEY_BY_EVENT: Partial<Record<GamificationEvent, keyof GamificationCounters>> = {
  login: 'logins',
  project_view: 'projectViews',
  favorite_add: 'favoritesAdded',
  share: 'shares',
  discussion_create: 'discussionsCreated',
  discussion_comment: 'discussionComments',
  discussion_like: 'discussionLikes',
  project_create: 'projectsCreated',
}

export const DAILY_QUESTS: DailyQuest[] = [
  {
    id: 'daily_explorer',
    title: '오늘의 탐색',
    description: '프로젝트 3개를 열어보세요.',
    descriptionEasy: '🔍 원하는 프로젝트 카드를 클릭하면 자세히 볼 수 있어요. 3개의 프로젝트를 열어서 내용을 확인해보세요!',
    descriptionHard: '프로젝트 3개 열람',
    event: 'project_view',
    target: 3,
    rewardXp: 36,
  },
  {
    id: 'daily_curator',
    title: '오늘의 큐레이션',
    description: '관심 프로젝트 1개를 즐겨찾기에 추가하세요.',
    descriptionEasy: '⭐ 마음에 드는 프로젝트를 발견했다면, 프로젝트 페이지의 북마크 아이콘을 클릭해서 즐겨찾기에 추가해보세요!',
    descriptionHard: '즐겨찾기 1개 추가',
    event: 'favorite_add',
    target: 1,
    rewardXp: 28,
  },
  {
    id: 'daily_connector',
    title: '오늘의 공유',
    description: '현재 보기 링크를 1회 공유하세요.',
    descriptionEasy: '🔗 좋은 프로젝트는 친구들과 공유하면 더욱 좋아요. 공유 버튼을 눌러서 링크를 전달해보세요!',
    descriptionHard: '링크 1회 공유',
    event: 'share',
    target: 1,
    rewardXp: 30,
  },
  {
    id: 'daily_contributor',
    title: '오늘의 기여',
    description: '커뮤니티 댓글을 1개 남기세요.',
    descriptionEasy: '💬 프로젝트에 대한 생각을 자유롭게 공유해보세요. 댓글창에 의견을 적어보세요!',
    descriptionHard: '댓글 1개 작성',
    event: 'discussion_comment',
    target: 1,
    rewardXp: 42,
  },
]

// 난이도에 따른 가이드 텍스트 - 모든 기능은 항상 사용 가능
export const GUIDE_TEXT_BY_MODE: Record<GamificationMode, GuideText> = {
  easy: {
    title: '환영해요! 👋',
    subtitle: '처음이신가요? 천천히 둘러보세요.',
    questTitle: '오늘의 미션',
    questDescription: '간단한 미션으로 시작해보세요.',
    progressLabel: '진행 상황',
    completedLabel: '완료한 미션',
    rewardLabel: '보상',
    hint: '💡 팁: 미션을 완료하면 경험치를 얻을 수 있어요!',
  },
  medium: {
    title: '오늘의 활동',
    subtitle: '매일매일 성장하세요.',
    questTitle: '데일리 퀘스트',
    questDescription: '오늘의 퀘스트를 완료하고 보상을 받으세요.',
    progressLabel: '진행률',
    completedLabel: '완료',
    rewardLabel: 'XP',
  },
  hard: {
    title: 'Daily Quests',
    subtitle: 'Complete. Earn. Grow.',
    questTitle: 'Quests',
    questDescription: 'Complete quests for XP rewards.',
    progressLabel: 'Progress',
    completedLabel: 'Done',
    rewardLabel: 'XP',
  },
}

const QUEST_BY_ID = new Map(DAILY_QUESTS.map((quest) => [quest.id, quest]))

function padNumber(value: number) {
  return value.toString().padStart(2, '0')
}

function parseDateKey(dateKey: string) {
  const [yearRaw, monthRaw, dayRaw] = dateKey.split('-')
  const year = Number.parseInt(yearRaw, 10)
  const month = Number.parseInt(monthRaw, 10)
  const day = Number.parseInt(dayRaw, 10)
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null
  }
  return { year, month, day }
}

function daysBetween(previousDateKey: string, nextDateKey: string) {
  const previousDate = parseDateKey(previousDateKey)
  const nextDate = parseDateKey(nextDateKey)
  if (!previousDate || !nextDate) {
    return null
  }

  const previousUtc = Date.UTC(previousDate.year, previousDate.month - 1, previousDate.day)
  const nextUtc = Date.UTC(nextDate.year, nextDate.month - 1, nextDate.day)
  const diff = Math.floor((nextUtc - previousUtc) / (1000 * 60 * 60 * 24))
  return Number.isFinite(diff) ? diff : null
}

function getCounterKey(event: GamificationEvent) {
  return COUNTER_KEY_BY_EVENT[event]
}

function createDailyProgress(dateKey: string): DailyProgress {
  return {
    date: dateKey,
    progress: {},
    completed: [],
  }
}

function ensureDailyProgress(state: GamificationState, dateKey: string) {
  if (state.daily.date === dateKey) {
    return state.daily
  }
  return createDailyProgress(dateKey)
}

function touchActiveDate(state: GamificationState, dateKey: string) {
  if (state.lastActiveDate === dateKey) {
    return state
  }

  const dayDiff = state.lastActiveDate ? daysBetween(state.lastActiveDate, dateKey) : null
  const nextStreakDays = dayDiff === 1 ? state.streakDays + 1 : 1

  const nextActiveDates = Array.from(new Set([...state.activeDates, dateKey])).sort().slice(-90)

  return {
    ...state,
    streakDays: nextStreakDays,
    longestStreakDays: Math.max(state.longestStreakDays, nextStreakDays),
    lastActiveDate: dateKey,
    activeDates: nextActiveDates,
  }
}

function computeLevelFromXp(xp: number) {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 120)) + 1)
}

export function getLevelFloorXp(level: number) {
  const normalizedLevel = Math.max(1, level)
  return Math.pow(normalizedLevel - 1, 2) * 120
}

export function getRequiredXpForLevel(level: number) {
  const normalizedLevel = Math.max(1, level)
  return Math.pow(normalizedLevel, 2) * 120
}

export function getTodayDateKey(currentDate = new Date()) {
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1
  const day = currentDate.getDate()
  return `${year}-${padNumber(month)}-${padNumber(day)}`
}

// 모든 퀘스트 반환 (난이도에 상관없이 모든 기능 사용 가능)
export function getAllDailyQuests(): DailyQuest[] {
  return DAILY_QUESTS
}

// 난이도에 따라 적절한 설명 반환
export function getQuestDescriptionForMode(quest: DailyQuest, mode: GamificationMode): string {
  if (mode === 'easy' && quest.descriptionEasy) {
    return quest.descriptionEasy
  }
  if (mode === 'hard' && quest.descriptionHard) {
    return quest.descriptionHard
  }
  return quest.description
}

// 난이도에 따른 가이드 텍스트 반환
export function getGuideTextForMode(mode: GamificationMode): GuideText {
  return GUIDE_TEXT_BY_MODE[mode] ?? GUIDE_TEXT_BY_MODE.medium
}

// 레거시 호환성을 위한 함수 (이전 방식대로 모든 퀘스트 반환)
export function getDailyQuestsForMode(mode: GamificationMode) {
  return getAllDailyQuests()
}

export function createInitialGamificationState(currentDate = new Date()): GamificationState {
  const dateKey = getTodayDateKey(currentDate)
  return {
    version: 1,
    xp: 0,
    level: 1,
    totalActions: 0,
    streakDays: 0,
    longestStreakDays: 0,
    lastActiveDate: null,
    activeDates: [],
    counters: {
      logins: 0,
      projectViews: 0,
      favoritesAdded: 0,
      shares: 0,
      discussionsCreated: 0,
      discussionComments: 0,
      discussionLikes: 0,
      projectsCreated: 0,
    },
    daily: createDailyProgress(dateKey),
  }
}

export function applyGamificationEvent(
  currentState: GamificationState,
  event: GamificationEvent,
  amount = 1,
  currentDate = new Date(),
): GamificationUpdate {
  const normalizedAmount = Number.isFinite(amount) ? Math.max(1, Math.floor(amount)) : 1
  const today = getTodayDateKey(currentDate)
  const previousLevel = currentState.level

  const stateWithActivity = touchActiveDate(
    {
      ...currentState,
      daily: ensureDailyProgress(currentState, today),
    },
    today,
  )

  const nextCounters = { ...stateWithActivity.counters }
  const counterKey = getCounterKey(event)
  if (counterKey) {
    nextCounters[counterKey] += normalizedAmount
  }

  let nextDailyProgress = { ...stateWithActivity.daily.progress }
  let nextDailyCompleted = [...stateWithActivity.daily.completed]
  const completedQuestIds: string[] = []
  const completedQuestTitles: string[] = []
  let questRewardXp = 0

  for (const quest of DAILY_QUESTS) {
    if (quest.event !== event) {
      continue
    }

    const currentProgress = nextDailyProgress[quest.id] ?? 0
    const updatedProgress = Math.min(quest.target, currentProgress + normalizedAmount)
    nextDailyProgress = {
      ...nextDailyProgress,
      [quest.id]: updatedProgress,
    }

    const alreadyCompleted = nextDailyCompleted.includes(quest.id)
    if (!alreadyCompleted && updatedProgress >= quest.target) {
      nextDailyCompleted = [...nextDailyCompleted, quest.id]
      completedQuestIds.push(quest.id)
      completedQuestTitles.push(quest.title)
      questRewardXp += quest.rewardXp
    }
  }

  const baseXp = XP_BY_EVENT[event] * normalizedAmount
  const xpGained = baseXp + questRewardXp
  const nextXp = stateWithActivity.xp + xpGained
  const nextLevel = computeLevelFromXp(nextXp)

  return {
    state: {
      ...stateWithActivity,
      xp: nextXp,
      level: nextLevel,
      totalActions: stateWithActivity.totalActions + normalizedAmount,
      counters: nextCounters,
      daily: {
        date: today,
        progress: nextDailyProgress,
        completed: nextDailyCompleted,
      },
    },
    xpGained,
    questRewardXp,
    completedQuestIds,
    completedQuestTitles,
    levelUp: nextLevel > previousLevel,
    previousLevel,
    nextLevel,
  }
}
