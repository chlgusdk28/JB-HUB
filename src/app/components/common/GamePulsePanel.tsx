import { CheckCircle2, Flame, Sparkles, Target, Trophy } from 'lucide-react'
import { OpalButton } from '../opal/OpalButton'
import {
  type GamificationMode,
  type GamificationState,
  getLevelFloorXp,
  getRequiredXpForLevel,
  getAllDailyQuests,
  getQuestDescriptionForMode,
  getGuideTextForMode,
} from '../../lib/gamification'

interface GamePulsePanelProps {
  state: GamificationState
  mode: GamificationMode
  onOpenAchievements?: () => void
  onOpenProjects?: () => void
}

export function GamePulsePanel({ state, mode, onOpenAchievements, onOpenProjects }: GamePulsePanelProps) {
  const quests = getAllDailyQuests()
  const guideText = getGuideTextForMode(mode)
  const completedCount = quests.filter((quest) => state.daily.completed.includes(quest.id)).length

  const levelFloorXp = getLevelFloorXp(state.level)
  const nextLevelXp = getRequiredXpForLevel(state.level + 1)
  const currentLevelXp = Math.max(0, state.xp - levelFloorXp)
  const neededLevelXp = Math.max(1, nextLevelXp - levelFloorXp)
  const levelProgressPercent = Math.min(100, Math.round((currentLevelXp / neededLevelXp) * 100))

  const dailyRewardPool = quests.reduce((sum, quest) => sum + quest.rewardXp, 0)

  return (
    <section className="surface-panel rounded-2xl p-4 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.06em] text-slate-500">활동 펄스</p>
          <h2 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">{guideText.questTitle}</h2>
          <p className="mt-1 text-sm text-slate-600">{guideText.questDescription}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
            <Trophy className="h-3.5 w-3.5 text-[#1f3e5a]" />
            Lv.{state.level}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
            <Flame className="h-3.5 w-3.5" />
            {state.streakDays}일 연속
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
            <Sparkles className="h-3.5 w-3.5" />
            {state.xp} XP
          </span>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/80 bg-white/70 p-3 backdrop-blur-sm">
        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-600">
          <span>레벨 진행률</span>
          <span>
            {currentLevelXp} / {neededLevelXp} XP
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-[#4f7394] transition-all duration-500"
            style={{ width: `${levelProgressPercent}%` }}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {quests.map((quest) => {
          const progress = Math.min(quest.target, state.daily.progress[quest.id] ?? 0)
          const completed = state.daily.completed.includes(quest.id)
          const progressPercent = Math.min(100, Math.round((progress / quest.target) * 100))

          return (
            <article
              key={quest.id}
              className={`rounded-2xl border p-3 transition-colors ${
                completed ? 'border-sky-200 bg-sky-50/70' : 'border-slate-200 bg-white/90'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{quest.title}</p>
                  <p className="mt-0.5 text-xs text-slate-600">{getQuestDescriptionForMode(quest, mode)}</p>
                </div>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    completed ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {completed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Target className="h-3.5 w-3.5" />}
                  {completed ? '완료' : `${progress}/${quest.target}`}
                </span>
              </div>

              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    completed ? 'bg-[#4f7394]' : 'bg-[#7f97b0]'
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <p className="mt-2 text-[11px] font-semibold text-slate-500">보상 +{quest.rewardXp} XP</p>
            </article>
          )
        })}
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-600">
          오늘 완료 {completedCount}/{quests.length}개, 일일 총 보상 {dailyRewardPool} XP
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {onOpenProjects ? (
            <OpalButton variant="secondary" size="sm" onClick={onOpenProjects}>
              프로젝트 탐색
            </OpalButton>
          ) : null}
          {onOpenAchievements ? (
            <OpalButton variant="primary" size="sm" onClick={onOpenAchievements}>
              업적 보러가기
            </OpalButton>
          ) : null}
        </div>
      </div>
    </section>
  )
}
