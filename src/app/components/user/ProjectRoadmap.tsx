import { useMemo, useState } from 'react'
import { Calendar, CheckCircle, Circle, Clock, Map, Plus, Trash2 } from 'lucide-react'
import { MetricCard, PageHeader, PageShell, Pill } from '../common'

interface MilestoneTask {
  id: string
  title: string
  completed: boolean
}

interface Milestone {
  id: string
  title: string
  description?: string
  status: 'completed' | 'in_progress' | 'planned'
  dueDate?: string
  completedAt?: string
  tasks?: MilestoneTask[]
}

interface ProjectRoadmapProps {
  projectId?: number
  projectTitle?: string
}

const DEFAULT_MILESTONES: Milestone[] = [
  {
    id: '1',
    title: '기획 정리',
    description: '요구사항을 정리하고 초기 범위를 고정합니다.',
    status: 'completed',
    completedAt: '2024-01-15',
    tasks: [
      { id: '1-1', title: '요구사항 확정', completed: true },
      { id: '1-2', title: '화면 흐름 정리', completed: true },
      { id: '1-3', title: '개발 범위 확인', completed: true },
    ],
  },
  {
    id: '2',
    title: '중심 기능 개발',
    description: '핵심 기능과 사용자 흐름을 구현합니다.',
    status: 'in_progress',
    dueDate: '2024-03-31',
    tasks: [
      { id: '2-1', title: '주요 API 연결', completed: true },
      { id: '2-2', title: '핵심 UI 구성', completed: true },
      { id: '2-3', title: '데이터 연동 검증', completed: false },
      { id: '2-4', title: '권한 처리 마무리', completed: false },
    ],
  },
  {
    id: '3',
    title: '테스트 안정화',
    description: '버그 수정과 사용자 피드백 반영을 진행합니다.',
    status: 'planned',
    dueDate: '2024-04-15',
  },
  {
    id: '4',
    title: '배포 준비',
    description: '운영 체크리스트를 정리하고 배포를 준비합니다.',
    status: 'planned',
    dueDate: '2024-05-01',
  },
]

const STATUS_LABELS: Record<Milestone['status'], string> = {
  completed: '완료',
  in_progress: '진행 중',
  planned: '계획',
}

export function ProjectRoadmap({ projectId: _projectId, projectTitle = '프로젝트' }: ProjectRoadmapProps) {
  const [milestones, setMilestones] = useState<Milestone[]>(DEFAULT_MILESTONES)
  const [showAddForm, setShowAddForm] = useState(false)

  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newStatus, setNewStatus] = useState<Milestone['status']>('planned')
  const [newDueDate, setNewDueDate] = useState('')

  const getProgress = (milestone: Milestone) => {
    if (!milestone.tasks || milestone.tasks.length === 0) {
      if (milestone.status === 'completed') {
        return 100
      }
      if (milestone.status === 'in_progress') {
        return 50
      }
      return 0
    }

    const completedCount = milestone.tasks.filter((task) => task.completed).length
    return Math.round((completedCount / milestone.tasks.length) * 100)
  }

  const overallProgress = useMemo(() => {
    if (milestones.length === 0) {
      return 0
    }
    return Math.round(milestones.reduce((sum, milestone) => sum + getProgress(milestone), 0) / milestones.length)
  }, [milestones])

  const completedMilestones = useMemo(
    () => milestones.filter((milestone) => milestone.status === 'completed').length,
    [milestones],
  )
  const activeMilestones = useMemo(
    () => milestones.filter((milestone) => milestone.status === 'in_progress').length,
    [milestones],
  )

  const handleAddMilestone = () => {
    const normalizedTitle = newTitle.trim()
    if (!normalizedTitle) {
      return
    }

    setMilestones((previous) => [
      ...previous,
      {
        id: Date.now().toString(),
        title: normalizedTitle,
        description: newDescription.trim() || undefined,
        status: newStatus,
        dueDate: newDueDate || undefined,
      },
    ])

    setNewTitle('')
    setNewDescription('')
    setNewStatus('planned')
    setNewDueDate('')
    setShowAddForm(false)
  }

  const handleDeleteMilestone = (milestoneId: string) => {
    if (!window.confirm('이 마일스톤을 삭제하시겠습니까?')) {
      return
    }
    setMilestones((previous) => previous.filter((milestone) => milestone.id !== milestoneId))
  }

  const handleToggleTask = (milestoneId: string, taskId: string) => {
    setMilestones((previous) =>
      previous.map((milestone) => {
        if (milestone.id !== milestoneId || !milestone.tasks) {
          return milestone
        }

        return {
          ...milestone,
          tasks: milestone.tasks.map((task) =>
            task.id === taskId ? { ...task, completed: !task.completed } : task,
          ),
        }
      }),
    )
  }

  const handleStatusChange = (milestoneId: string, status: Milestone['status']) => {
    setMilestones((previous) =>
      previous.map((milestone) =>
        milestone.id === milestoneId
          ? {
              ...milestone,
              status,
              completedAt: status === 'completed' ? new Date().toISOString() : undefined,
            }
          : milestone,
      ),
    )
  }

  const renderStatusIcon = (status: Milestone['status']) => {
    if (status === 'completed') {
      return <CheckCircle className="h-6 w-6 text-sky-700" />
    }
    if (status === 'in_progress') {
      return <Clock className="h-6 w-6 text-[#315779]" />
    }
    return <Circle className="h-6 w-6 text-slate-400" />
  }

  const summaryMetrics = [
    { key: 'milestones', label: '마일스톤', value: milestones.length },
    { key: 'completed', label: '완료 단계', value: completedMilestones },
    { key: 'active', label: '진행 중', value: activeMilestones },
    { key: 'progress', label: '전체 진행률', value: `${overallProgress}%` },
  ]

  return (
    <PageShell>
      <PageHeader
        eyebrow={
          <>
            <Map className="h-3.5 w-3.5" />
            Delivery Timeline
          </>
        }
        title={`${projectTitle} 로드맵`}
        description="마일스톤과 세부 작업을 하나의 흐름으로 정리해 현재 상태와 다음 단계를 함께 볼 수 있는 추진 보드입니다."
        meta={
          <>
            <Pill variant="subtle">마일스톤: {milestones.length}</Pill>
            <Pill variant="subtle">진행률: {overallProgress}%</Pill>
            <Pill variant="subtle">진행 중: {activeMilestones}</Pill>
          </>
        }
      />

      <section className="page-metric-grid">
        {summaryMetrics.map((metric) => (
          <MetricCard key={metric.key} label={metric.label} value={metric.value} />
        ))}
      </section>

      <section className="page-toolbar-panel page-toolbar-stack">
        <div className="page-toolbar-row">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">로드맵 관리</h2>
            <p className="page-toolbar-note">각 단계의 상태와 작업 진행률이 동일한 규칙으로 표시되도록 정리했습니다.</p>
          </div>
          <button type="button" onClick={() => setShowAddForm((previous) => !previous)} className="glass-inline-button">
            <Plus className="h-4 w-4" />
            마일스톤 추가
          </button>
        </div>
      </section>

      <section className="page-panel">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">전체 진행률</span>
          <span className="text-lg font-bold text-[#315779]">{overallProgress}%</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full bg-gradient-to-r from-[#7f97b0] to-[#4f7394] transition-all duration-500"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </section>

      {showAddForm ? (
        <section className="page-panel-lg">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">새 마일스톤 추가</h3>
              <p className="mt-1 text-sm text-slate-600">제목, 상태, 목표 일정을 입력해 로드맵 흐름에 바로 추가할 수 있습니다.</p>
            </div>

            <label className="space-y-1.5">
              <span className="field-label">제목</span>
              <input
                type="text"
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
                placeholder="예: QA 마감"
                className="select-soft"
              />
            </label>

            <label className="space-y-1.5">
              <span className="field-label">설명</span>
              <input
                type="text"
                value={newDescription}
                onChange={(event) => setNewDescription(event.target.value)}
                placeholder="이번 마일스톤의 목적을 간단히 적어 주세요."
                className="select-soft"
              />
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="field-label">상태</span>
                <select value={newStatus} onChange={(event) => setNewStatus(event.target.value as Milestone['status'])} className="select-soft">
                  <option value="planned">계획</option>
                  <option value="in_progress">진행 중</option>
                  <option value="completed">완료</option>
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="field-label">목표 일정</span>
                <input type="date" value={newDueDate} onChange={(event) => setNewDueDate(event.target.value)} className="select-soft" />
              </label>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowAddForm(false)} className="filter-chip-clear">
                취소
              </button>
              <button
                type="button"
                onClick={handleAddMilestone}
                disabled={!newTitle.trim()}
                className="glass-inline-button disabled:cursor-not-allowed disabled:opacity-50"
              >
                추가
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <section className="page-list-stack">
        {milestones.map((milestone, index) => {
          const progress = getProgress(milestone)
          const isLast = index === milestones.length - 1

          return (
            <article key={milestone.id} className="relative">
              {!isLast ? <div className="absolute bottom-0 left-6 top-12 w-0.5 bg-slate-200" /> : null}

              <div className="flex gap-4">
                <div
                  className={`relative z-10 rounded-full p-1 ${
                    milestone.status === 'completed'
                      ? 'bg-sky-100'
                      : milestone.status === 'in_progress'
                        ? 'bg-blue-100'
                        : 'bg-slate-100'
                  }`}
                >
                  {renderStatusIcon(milestone.status)}
                </div>

                <div className="flex-1 rounded-[24px] border border-slate-200 bg-white/95 p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-slate-900">{milestone.title}</h3>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            milestone.status === 'completed'
                              ? 'bg-sky-100 text-sky-700'
                              : milestone.status === 'in_progress'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {STATUS_LABELS[milestone.status]}
                        </span>
                      </div>
                      {milestone.description ? <p className="text-sm text-slate-600">{milestone.description}</p> : null}
                    </div>

                    <div className="page-toolbar-cluster">
                      <select
                        value={milestone.status}
                        onChange={(event) => handleStatusChange(milestone.id, event.target.value as Milestone['status'])}
                        className="select-soft max-w-[9rem]"
                      >
                        <option value="planned">계획</option>
                        <option value="in_progress">진행 중</option>
                        <option value="completed">완료</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => handleDeleteMilestone(milestone.id)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                      <span>진행률</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={`h-full transition-all ${
                          milestone.status === 'completed'
                            ? 'bg-sky-500'
                            : milestone.status === 'in_progress'
                              ? 'bg-[#4f7394]'
                              : 'bg-slate-400'
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  {milestone.dueDate ? (
                    <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
                      <Calendar className="h-3.5 w-3.5" />
                      목표 일정 {new Date(milestone.dueDate).toLocaleDateString('ko-KR')}
                    </div>
                  ) : null}

                  {milestone.tasks && milestone.tasks.length > 0 ? (
                    <div className="space-y-2">
                      {milestone.tasks.map((task) => (
                        <div
                          key={task.id}
                          className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 transition-colors hover:bg-slate-100"
                        >
                          <button
                            type="button"
                            onClick={() => handleToggleTask(milestone.id, task.id)}
                            className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition-colors ${
                              task.completed ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300 hover:border-sky-500'
                            }`}
                          >
                            {task.completed ? <CheckCircle className="h-3 w-3" /> : null}
                          </button>
                          <span className={`flex-1 text-sm ${task.completed ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                            {task.title}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </article>
          )
        })}
      </section>
    </PageShell>
  )
}
