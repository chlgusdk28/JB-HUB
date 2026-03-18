import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Download, GitFork, Link2, MessageSquare, Send, Star, TrendingUp } from 'lucide-react'
import type { Project } from '../lib/project-utils'
import { FilesTab } from './FilesTab'
import { ProjectDockerTab } from './ProjectDockerTab'
import { QuietTabs } from './QuietTabs'
import { MarkdownContent } from './common'
import { OpalButton } from './opal/OpalButton'
import { OpalCard } from './opal/OpalCard'
import { OpalProjectCard } from './opal/OpalProjectCard'

interface QuietProjectDetailProps {
  project: Project
  relatedProjects: Project[]
  isFavorite: boolean
  currentUserName: string
  canManageFiles: boolean
  onToggleFavorite: (projectId: number) => void
  onOpenProject: (projectId: number) => void
  onShare?: () => void
}

interface LocalComment {
  id: number
  author: string
  message: string
  createdAt: string
}

const DETAIL_TABS = [
  { id: 'overview', label: '개요' },
  { id: 'files', label: '파일' },
  { id: 'docker', label: 'Docker' },
  { id: 'metrics', label: '지표' },
  { id: 'comments', label: '댓글' },
]

function buildCommentStorageKey(projectId: number) {
  return `jb-hub:project-comments:${projectId}`
}

function exportProjectJson(project: Project) {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `project-${project.id}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

function getDefaultComments(project: Project): LocalComment[] {
  return [
    {
      id: 1,
      author: '제품팀',
      message: '다음 업데이트에서 아키텍처 다이어그램을 간단히 추가해주세요.',
      createdAt: '2시간 전',
    },
    {
      id: 2,
      author: project.author,
      message: '업데이트했습니다. 운영팀을 위한 배포 노트도 보강했습니다.',
      createdAt: '1시간 전',
    },
  ]
}

function readStoredComments(project: Project) {
  if (typeof window === 'undefined') {
    return getDefaultComments(project)
  }

  const raw = window.localStorage.getItem(buildCommentStorageKey(project.id))
  if (!raw) {
    return getDefaultComments(project)
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return getDefaultComments(project)
    }

    const comments = parsed
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null
        }

        const value = item as Record<string, unknown>
        const id = Number(value.id)
        const author = String(value.author ?? '').trim()
        const message = String(value.message ?? '').trim()
        const createdAt = String(value.createdAt ?? '').trim()

        if (!Number.isFinite(id) || !author || !message || !createdAt) {
          return null
        }

        return {
          id,
          author,
          message,
          createdAt,
        } satisfies LocalComment
      })
      .filter((item): item is LocalComment => Boolean(item))

    return comments.length > 0 ? comments : getDefaultComments(project)
  } catch {
    return getDefaultComments(project)
  }
}

export function QuietProjectDetail({
  project,
  relatedProjects,
  isFavorite,
  currentUserName,
  canManageFiles,
  onToggleFavorite,
  onOpenProject,
  onShare,
}: QuietProjectDetailProps) {
  const [activeTab, setActiveTab] = useState('overview')
  const [commentInput, setCommentInput] = useState('')
  const [comments, setComments] = useState<LocalComment[]>(() => readStoredComments(project))

  useEffect(() => {
    setComments(readStoredComments(project))
  }, [project])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(buildCommentStorageKey(project.id), JSON.stringify(comments))
    }
  }, [comments, project.id])

  const trendLabel = useMemo(() => {
    if (project.trend === 'rising') {
      return '상승'
    }
    if (project.badge) {
      if (project.badge === 'new' || project.badge === '신규') {
        return '신규'
      }
      if (project.badge === 'best' || project.badge === '베스트') {
        return '베스트'
      }
      if (project.badge === 'hot' || project.badge === '인기') {
        return '인기'
      }
      return project.badge
    }
    return '안정'
  }, [project.badge, project.trend])

  const qualityScore = useMemo(() => {
    return Math.round(project.stars * 0.6 + project.forks * 0.5 + project.comments * 0.8 + project.views / 120)
  }, [project.comments, project.forks, project.stars, project.views])

  const impactLevel = useMemo(() => {
    if (qualityScore >= 180) {
      return '매우 높음'
    }
    if (qualityScore >= 120) {
      return '높음'
    }
    if (qualityScore >= 80) {
      return '보통'
    }
    return '초기'
  }, [qualityScore])

  const handleCommentSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalized = commentInput.trim()
    if (!normalized) {
      return
    }

    setComments((previous) => [
      ...previous,
      {
        id: previous.length + 1,
        author: currentUserName,
        message: normalized,
        createdAt: '방금 전',
      },
    ])
    setCommentInput('')
  }

  return (
    <div className="page-shell">
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">{project.department}</span>
          <span>{project.author}</span>
          <span>·</span>
          <span>{project.createdAt ?? '최근 업데이트'}</span>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{project.title}</h1>
        <div className="w-full rounded-[28px] border border-slate-200/80 bg-white/84 px-5 py-4 shadow-[0_18px_40px_rgba(12,35,58,0.08)]">
          <MarkdownContent markdown={project.description} variant="hero" />
        </div>

        <div className="pill-row">
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">트렌드: {trendLabel}</span>
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">영향도: {impactLevel}</span>
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">품질 점수: {qualityScore}</span>
        </div>

        <div className="action-row">
          <OpalButton
            variant={isFavorite ? 'primary' : 'secondary'}
            size="sm"
            icon={<Star className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} />}
            onClick={() => onToggleFavorite(project.id)}
          >
            {isFavorite ? '즐겨찾기됨' : '즐겨찾기 추가'}
          </OpalButton>
          <OpalButton
            variant="secondary"
            size="sm"
            icon={<Download className="h-4 w-4" />}
            onClick={() => exportProjectJson(project)}
          >
            JSON 내보내기
          </OpalButton>
          <OpalButton variant="secondary" size="sm" icon={<Link2 className="h-4 w-4" />} onClick={onShare}>
            공유
          </OpalButton>
        </div>
      </header>

      <QuietTabs tabs={DETAIL_TABS} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'overview' ? (
        <section className="space-y-6">
          <OpalCard padding="comfortable" elevation="minimal">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-slate-500">스타</p>
                <p className="mt-1 text-xl font-semibold text-slate-900">{project.stars}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">포크</p>
                <p className="mt-1 text-xl font-semibold text-slate-900">{project.forks}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">댓글</p>
                <p className="mt-1 text-xl font-semibold text-slate-900">{project.comments}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">조회수</p>
                <p className="mt-1 text-xl font-semibold text-slate-900">{project.views.toLocaleString()}</p>
              </div>
            </div>
          </OpalCard>

          <div className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">연관 프로젝트</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {relatedProjects.map((related) => (
                <OpalProjectCard key={related.id} {...related} onClick={() => onOpenProject(related.id)} />
              ))}
              {relatedProjects.length === 0 ? (
                <div className="empty-panel">
                  <p className="text-sm text-slate-600">연관 프로젝트가 없습니다.</p>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === 'metrics' ? (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <OpalCard padding="comfortable" elevation="minimal">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-slate-700" />
              <h3 className="text-lg font-semibold text-slate-900">도입 신호</h3>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              누적 조회수 {project.views.toLocaleString()}회, 스타 {project.stars}개로 {impactLevel} 도입 흐름을 보입니다.
            </p>
          </OpalCard>

          <OpalCard padding="comfortable" elevation="minimal">
            <div className="flex items-center gap-2">
              <GitFork className="h-5 w-5 text-slate-700" />
              <h3 className="text-lg font-semibold text-slate-900">개발 활동</h3>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              포크와 댓글 지표를 통해 협업 깊이와 유지보수 준비도를 확인할 수 있습니다.
            </p>
          </OpalCard>
        </section>
      ) : null}

      {activeTab === 'files' ? (
        <FilesTab
          projectId={project.id}
          currentUserName={currentUserName}
          projectAuthor={project.author}
          canUpload={canManageFiles}
        />
      ) : null}

      {activeTab === 'docker' ? (
        <ProjectDockerTab
          projectId={project.id}
          currentUserName={currentUserName}
          projectAuthor={project.author}
        />
      ) : null}

      {activeTab === 'comments' ? (
        <section className="space-y-4">
          <form onSubmit={handleCommentSubmit} className="surface-panel rounded-2xl p-4">
            <div className="space-y-3">
              <textarea
                value={commentInput}
                onChange={(event) => setCommentInput(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none ring-slate-200 transition focus:border-slate-500 focus:ring-2"
                placeholder="이 프로젝트에 대한 댓글을 입력하세요..."
                rows={4}
              />
              <div className="flex justify-end">
                <OpalButton type="submit" variant="primary" size="sm" icon={<Send className="h-4 w-4" />}>
                  댓글 추가
                </OpalButton>
              </div>
            </div>
          </form>

          <div className="space-y-3">
            {comments.map((comment) => (
              <OpalCard key={comment.id} padding="comfortable" elevation="minimal">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-900">{comment.author}</p>
                  <p className="text-xs text-slate-500">{comment.createdAt}</p>
                  <p className="pt-1 text-sm text-slate-700">{comment.message}</p>
                </div>
              </OpalCard>
            ))}
            {comments.length === 0 ? (
              <div className="empty-panel">
                <p className="text-sm text-slate-600">아직 댓글이 없습니다.</p>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3.5 w-3.5" />
              댓글은 이 브라우저에 저장됩니다.
            </span>
          </div>
        </section>
      ) : null}
    </div>
  )
}
