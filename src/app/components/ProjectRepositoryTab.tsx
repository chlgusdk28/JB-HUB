import { useEffect, useMemo, useState } from 'react'
import { BookText, Download, FileCode2, FolderTree, GitBranch, LoaderCircle, PencilLine, Save, X } from 'lucide-react'
import {
  buildProjectFileDownloadUrl,
  fetchProjectReadme,
  updateProjectReadme,
  type ProjectFileNode,
  type ProjectReadmeDocument,
} from '../lib/projects-api'
import { FilesTab } from './FilesTab'
import { useToast } from './ToastProvider'
import { MarkdownContent, Pill } from './common'

interface ProjectRepositoryTabProps {
  projectId?: number
  currentUserName?: string
  projectAuthor?: string
  canManage?: boolean
}

function formatReadmeUpdatedAt(value?: string | null) {
  if (!value) {
    return '아직 저장 기록이 없습니다.'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return '저장 시간을 확인할 수 없습니다.'
  }

  return parsed.toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ProjectRepositoryTab({
  projectId,
  currentUserName = '',
  projectAuthor = '',
  canManage = false,
}: ProjectRepositoryTabProps) {
  const { error, success } = useToast()
  const [readme, setReadme] = useState<ProjectReadmeDocument | null>(null)
  const [readmeDraft, setReadmeDraft] = useState('')
  const [isReadmeLoading, setIsReadmeLoading] = useState(false)
  const [isReadmeSaving, setIsReadmeSaving] = useState(false)
  const [isEditingReadme, setIsEditingReadme] = useState(false)
  const [filesRefreshKey, setFilesRefreshKey] = useState(0)

  async function loadReadme() {
    if (!projectId) {
      setReadme(null)
      setReadmeDraft('')
      return
    }

    setIsReadmeLoading(true)

    try {
      const nextReadme = await fetchProjectReadme(projectId)
      setReadme(nextReadme)
      setReadmeDraft(nextReadme.content)
    } catch (loadError) {
      setReadme(null)
      setReadmeDraft('')
      error(loadError instanceof Error ? loadError.message : 'README를 불러오지 못했습니다.')
    } finally {
      setIsReadmeLoading(false)
    }
  }

  useEffect(() => {
    void loadReadme()
  }, [projectId])

  useEffect(() => {
    setIsEditingReadme(false)
  }, [projectId])

  const previewMarkdown = useMemo(() => {
    if (isEditingReadme) {
      return readmeDraft
    }

    return readme?.content ?? ''
  }, [isEditingReadme, readme?.content, readmeDraft])

  async function handleSaveReadme() {
    if (!projectId) {
      return
    }

    if (!canManage || !currentUserName.trim()) {
      error('프로젝트 작성자만 README를 수정할 수 있습니다.')
      return
    }

    setIsReadmeSaving(true)

    try {
      const savedReadme = await updateProjectReadme(projectId, readmeDraft, currentUserName)
      setReadme(savedReadme)
      setReadmeDraft(savedReadme.content)
      setIsEditingReadme(false)
      setFilesRefreshKey((previous) => previous + 1)
      success('README를 저장했습니다.')
    } catch (saveError) {
      error(saveError instanceof Error ? saveError.message : 'README를 저장하지 못했습니다.')
    } finally {
      setIsReadmeSaving(false)
    }
  }

  function handleCancelEdit() {
    setReadmeDraft(readme?.content ?? '')
    setIsEditingReadme(false)
  }

  function handleFilesChanged(_files: ProjectFileNode[]) {
    if (isEditingReadme) {
      return
    }

    void loadReadme()
  }

  return (
    <div className="space-y-4">
      <section className="page-panel space-y-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Pill variant="subtle">Project Repository</Pill>
              <Pill variant="subtle">README + Source</Pill>
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-slate-900">프로젝트 기준으로 소스코드와 문서를 함께 관리합니다.</h2>
              <p className="text-sm text-slate-600">
                GitHub처럼 루트 README를 먼저 보여주고, 아래에서 폴더 구조를 유지한 채 파일과 소스코드를 업로드할 수 있습니다.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2 text-slate-700">
                <GitBranch className="h-4 w-4" />
                <span className="text-sm font-semibold">프로젝트 저장소</span>
              </div>
              <p className="mt-2 text-sm text-slate-600">파일 업로드는 프로젝트 단위로 분리되며 폴더 구조도 그대로 유지됩니다.</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2 text-slate-700">
                <FolderTree className="h-4 w-4" />
                <span className="text-sm font-semibold">README 문서 홈</span>
              </div>
              <p className="mt-2 text-sm text-slate-600">README는 루트 문서로 저장되고, 프로젝트 소개와 실행 방법을 한곳에 정리할 수 있습니다.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="surface-panel overflow-hidden rounded-2xl">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <BookText className="h-4 w-4 text-slate-700" />
              <h3 className="text-base font-semibold text-slate-900">{readme?.path ?? 'README.md'}</h3>
              {readme?.exists ? <Pill variant="subtle">루트 문서</Pill> : <Pill variant="subtle">초안</Pill>}
            </div>
            <p className="text-sm text-slate-600">
              프로젝트 소개, 실행 방법, 주요 경로, 운영 메모를 여기에 적어두면 팀원이 저장소를 훨씬 빠르게 파악할 수 있습니다.
            </p>
            <p className="text-xs text-slate-500">
              {readme?.exists
                ? `${formatReadmeUpdatedAt(readme.updatedAt)} 기준으로 저장되었습니다.`
                : '아직 저장된 README가 없어서 기본 템플릿을 보여주고 있습니다.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {readme ? (
              <a
                href={buildProjectFileDownloadUrl(projectId ?? 0, readme.path)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
                원본 다운로드
              </a>
            ) : null}

            {isEditingReadme ? (
              <>
                <button
                  type="button"
                  onClick={() => void handleSaveReadme()}
                  disabled={isReadmeSaving}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isReadmeSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  저장
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={isReadmeSaving}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <X className="h-4 w-4" />
                  취소
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditingReadme(true)}
                disabled={!canManage || !currentUserName.trim() || isReadmeLoading}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <PencilLine className="h-4 w-4" />
                README 편집
              </button>
            )}
          </div>
        </div>

        {!canManage ? (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {projectAuthor
              ? `${projectAuthor}님만 이 프로젝트의 README를 수정할 수 있습니다.`
              : '이 프로젝트의 README를 수정할 권한이 없습니다.'}
          </div>
        ) : null}

        <div className="p-4">
          {isReadmeLoading ? (
            <div className="flex min-h-[220px] items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 text-sm text-slate-500">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              README를 불러오는 중입니다.
            </div>
          ) : isEditingReadme ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <FileCode2 className="h-4 w-4 text-slate-500" />
                  Markdown 편집
                </div>
                <textarea
                  value={readmeDraft}
                  onChange={(event) => setReadmeDraft(event.target.value)}
                  spellCheck={false}
                  className="min-h-[360px] w-full rounded-2xl border border-slate-200 bg-slate-950 px-4 py-4 font-mono text-sm leading-6 text-slate-100 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-300"
                  placeholder="# 프로젝트 소개&#10;&#10;실행 방법과 주요 파일 구조를 적어주세요."
                />
                <p className="text-xs text-slate-500">
                  내용을 비워 저장하면 프로젝트 기본 템플릿 README로 다시 채워집니다.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <BookText className="h-4 w-4 text-slate-500" />
                  미리보기
                </div>
                <div className="min-h-[360px] rounded-2xl border border-slate-200 bg-white p-5">
                  <MarkdownContent markdown={previewMarkdown} variant="editor" />
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <MarkdownContent markdown={previewMarkdown} variant="editor" />
            </div>
          )}
        </div>
      </section>

      <FilesTab
        key={`${projectId ?? 'unknown'}-${filesRefreshKey}`}
        projectId={projectId}
        currentUserName={currentUserName}
        projectAuthor={projectAuthor}
        canUpload={canManage}
        onFilesChanged={handleFilesChanged}
      />
    </div>
  )
}
