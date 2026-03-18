import { useMemo, useState } from 'react'
import { Clock3, FolderGit2, Sparkles, Star, Users } from 'lucide-react'
import type { Project } from '../lib/project-utils'
import { OpalCard } from './opal/OpalCard'
import { OpalProjectCard } from './opal/OpalProjectCard'

interface WorkspaceProps {
  projects: Project[]
  favoriteIds: number[]
  recentProjectIds: number[]
  currentUser: {
    name: string
    department: string
  }
  onProjectClick?: (projectId: number) => void
}

type WorkspaceTab = 'owned' | 'team' | 'favorites' | 'recent'

export function Workspace({
  projects,
  favoriteIds,
  recentProjectIds,
  currentUser,
  onProjectClick,
}: WorkspaceProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('owned')

  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds])

  const ownedProjects = useMemo(
    () => projects.filter((project) => project.author === currentUser.name),
    [projects, currentUser.name],
  )

  const sameDepartmentProjects = useMemo(
    () =>
      projects
        .filter((project) => project.department === currentUser.department && project.author !== currentUser.name)
        .sort((a, b) => b.stars - a.stars),
    [projects, currentUser.department, currentUser.name],
  )

  const favoriteProjects = useMemo(
    () => projects.filter((project) => favoriteSet.has(project.id)).sort((a, b) => b.stars - a.stars),
    [projects, favoriteSet],
  )

  const recentProjects = useMemo(() => {
    return recentProjectIds
      .map((id) => projects.find((project) => project.id === id))
      .filter((project): project is Project => Boolean(project))
  }, [recentProjectIds, projects])

  const currentList = useMemo(() => {
    switch (activeTab) {
      case 'owned':
        return ownedProjects
      case 'team':
        return sameDepartmentProjects
      case 'favorites':
        return favoriteProjects
      case 'recent':
        return recentProjects
      default:
        return ownedProjects
    }
  }, [activeTab, ownedProjects, sameDepartmentProjects, favoriteProjects, recentProjects])

  const topTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const project of projects) {
      for (const tag of project.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1)
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
  }, [projects])

  return (
    <div className="page-shell">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">워크스페이스</h1>
        <p className="text-sm text-slate-600 sm:text-base">
          내 프로젝트, 부서 협업, 저장 항목을 한곳에서 관리하는 작업 공간입니다.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OpalCard padding="comfortable" elevation="minimal">
          <div className="flex items-center gap-3">
            <FolderGit2 className="h-5 w-5 text-slate-700" />
            <div>
              <p className="text-sm text-slate-500">내 프로젝트</p>
              <p className="text-2xl font-semibold text-slate-900">{ownedProjects.length}</p>
            </div>
          </div>
        </OpalCard>
        <OpalCard padding="comfortable" elevation="minimal">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-slate-700" />
            <div>
              <p className="text-sm text-slate-500">같은 부서</p>
              <p className="text-2xl font-semibold text-slate-900">{sameDepartmentProjects.length}</p>
            </div>
          </div>
        </OpalCard>
        <OpalCard padding="comfortable" elevation="minimal">
          <div className="flex items-center gap-3">
            <Star className="h-5 w-5 text-slate-700" />
            <div>
              <p className="text-sm text-slate-500">즐겨찾기</p>
              <p className="text-2xl font-semibold text-slate-900">{favoriteProjects.length}</p>
            </div>
          </div>
        </OpalCard>
        <OpalCard padding="comfortable" elevation="minimal">
          <div className="flex items-center gap-3">
            <Clock3 className="h-5 w-5 text-slate-700" />
            <div>
              <p className="text-sm text-slate-500">최근 조회</p>
              <p className="text-2xl font-semibold text-slate-900">{recentProjects.length}</p>
            </div>
          </div>
        </OpalCard>
      </section>

      <section className="surface-panel rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('owned')}
            className={`chip-filter ${activeTab === 'owned' ? 'chip-filter-active' : 'chip-filter-idle'}`}
          >
            내 프로젝트 ({ownedProjects.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('team')}
            className={`chip-filter ${activeTab === 'team' ? 'chip-filter-active' : 'chip-filter-idle'}`}
          >
            같은 부서 ({sameDepartmentProjects.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('favorites')}
            className={`chip-filter ${activeTab === 'favorites' ? 'chip-filter-active' : 'chip-filter-idle'}`}
          >
            즐겨찾기 ({favoriteProjects.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('recent')}
            className={`chip-filter ${activeTab === 'recent' ? 'chip-filter-active' : 'chip-filter-idle'}`}
          >
            최근 조회 ({recentProjects.length})
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {currentList.map((project) => (
          <OpalProjectCard key={project.id} {...project} onClick={() => onProjectClick?.(project.id)} />
        ))}
        {currentList.length === 0 ? (
          <div className="empty-panel">
            <p className="text-sm text-slate-600">이 섹션에는 표시할 프로젝트가 없습니다.</p>
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
          <Sparkles className="h-5 w-5 text-slate-700" />
          자주 쓰는 태그
        </h2>
        <div className="flex flex-wrap gap-2">
          {topTags.map(([tag, count]) => (
            <span
              key={tag}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
            >
              {tag} ({count})
            </span>
          ))}
        </div>
      </section>
    </div>
  )
}
