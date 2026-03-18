import { X, Star, GitFork, Eye, TrendingUp, Calendar, Award } from 'lucide-react'
import { useRef } from 'react'
import { OpalTag } from './opal/OpalTag'

interface UserProfileModalProps {
  user: {
    name: string
    department: string
    avatar: string
    totalStars: number
    totalProjects: number
    totalForks: number
    recentActivity: number
  }
  onClose: () => void
  onProjectClick: (projectId: number) => void
}

type UserProject = {
  id: number
  title: string
  description: string
  stars: number
  forks: number
  views: number
  tags: string[]
}

type UserFixture = {
  projects: UserProject[]
  techStack: string[]
}

const DEFAULT_FIXTURE: UserFixture = {
  projects: [
    {
      id: 1,
      title: '업무 포털 성능 개선',
      description: '사내 업무 포털의 초기 로딩 속도와 화면 응답성을 개선한 프로젝트입니다.',
      stars: 88,
      forks: 16,
      views: 2174,
      tags: ['프론트엔드', '성능'],
    },
    {
      id: 2,
      title: '운영 대시보드 자동 리포트',
      description: '주간 운영 지표를 자동 집계해 메일과 메신저로 공유하는 자동화 프로젝트입니다.',
      stars: 64,
      forks: 11,
      views: 1632,
      tags: ['자동화', '대시보드'],
    },
  ],
  techStack: ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'Docker', 'Grafana'],
}

export function UserProfileModal({ user, onClose, onProjectClick }: UserProfileModalProps) {
  const fixture = DEFAULT_FIXTURE
  const totalViews = fixture.projects.reduce((sum, project) => sum + project.views, 0)
  const modalRef = useRef<HTMLDivElement>(null)

  const handleBackdropClick = (event: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
      onClose()
    }
  }

  const statCards = [
    {
      label: '누적 별표',
      value: user.totalStars.toLocaleString(),
      icon: Star,
      iconClass: 'bg-sky-100 text-sky-700',
      valueClass: 'text-[#315779]',
    },
    {
      label: '총 조회수',
      value: totalViews.toLocaleString(),
      icon: TrendingUp,
      iconClass: 'bg-slate-100 text-slate-700',
      valueClass: 'text-slate-900',
    },
    {
      label: '포크',
      value: user.totalForks.toLocaleString(),
      icon: GitFork,
      iconClass: 'bg-indigo-100 text-indigo-700',
      valueClass: 'text-slate-900',
    },
    {
      label: '이번 달 활동',
      value: `${user.recentActivity}건`,
      icon: Calendar,
      iconClass: 'bg-cyan-100 text-cyan-700',
      valueClass: 'text-slate-900',
    },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-3 backdrop-blur-sm sm:p-6"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="surface-panel max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[28px]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sticky top-0 z-20 flex items-center justify-between rounded-t-[28px] border-b border-slate-200/80 bg-white/92 px-5 py-4 backdrop-blur sm:px-7 sm:py-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-500">프로필</p>
            <h2 className="truncate text-xl font-semibold text-slate-900 sm:text-2xl">{user.name}</h2>
          </div>
          <button type="button" onClick={onClose} className="glass-inline-button !px-3 !py-1.5 text-xs">
            <X className="h-4 w-4" />
            닫기
          </button>
        </header>

        <div className="space-y-6 p-5 sm:p-7">
          <section className="surface-soft rounded-2xl p-5 sm:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
              <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-[#eaf1f8] text-4xl font-semibold text-[#315779] sm:h-28 sm:w-28">
                {user.avatar}
              </div>
              <div className="min-w-0 flex-1 space-y-4">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h3 className="text-2xl font-semibold text-slate-900 sm:text-3xl">{user.name}</h3>
                  <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                    <Award className="h-3.5 w-3.5" />
                    핵심 기여자
                  </span>
                </div>
                <p className="text-sm text-slate-600 sm:text-base">{user.department}</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  <div>
                    <p className="text-2xl font-semibold text-[#315779]">{user.totalStars}</p>
                    <p className="text-xs text-slate-500">누적 별표</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-slate-900">{user.totalProjects}</p>
                    <p className="text-xs text-slate-500">프로젝트</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-slate-900">{user.totalForks}</p>
                    <p className="text-xs text-slate-500">포크</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-slate-900">{user.recentActivity}</p>
                    <p className="text-xs text-slate-500">이번 달 활동</p>
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold tracking-[0.05em] text-slate-500">주요 기술 스택</p>
                  <div className="flex flex-wrap gap-2">
                    {fixture.techStack.map((tech) => (
                      <OpalTag key={tech} size="sm" variant="primary">
                        {tech}
                      </OpalTag>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {statCards.map((card) => {
              const Icon = card.icon
              return (
                <div key={card.label} className="surface-soft rounded-2xl p-4">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${card.iconClass}`}>
                      <Icon className="h-5 w-5" strokeWidth={1.7} />
                    </div>
                    <div>
                      <p className={`text-lg font-semibold ${card.valueClass}`}>{card.value}</p>
                      <p className="text-xs text-slate-500">{card.label}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </section>

          <section className="surface-panel rounded-2xl p-5 sm:p-6">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs font-semibold tracking-[0.08em] text-slate-500">프로젝트</p>
                <h3 className="mt-1 text-xl font-semibold text-slate-900">대표 프로젝트</h3>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {fixture.projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => {
                    onClose()
                    onProjectClick(project.id)
                  }}
                  className="group rounded-2xl border border-slate-200/90 bg-white p-5 text-left shadow-[0_8px_18px_rgba(20,36,54,0.07)] transition-colors hover:border-slate-300 hover:bg-slate-50/60"
                >
                  <h4 className="text-base font-semibold text-slate-900 transition-colors group-hover:text-[#1f3e5a]">
                    {project.title}
                  </h4>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-600">{project.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {project.tags.map((tag) => (
                      <OpalTag key={tag} size="sm" variant="secondary">
                        {tag}
                      </OpalTag>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center gap-4 border-t border-slate-200 pt-3 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1.5">
                      <Eye className="h-3.5 w-3.5" />
                      {project.views.toLocaleString()}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-[#315779]">
                      <Star className="h-3.5 w-3.5" fill="currentColor" />
                      {project.stars}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <GitFork className="h-3.5 w-3.5" />
                      {project.forks}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
