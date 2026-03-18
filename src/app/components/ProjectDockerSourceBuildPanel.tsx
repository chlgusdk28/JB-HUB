import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Boxes, ExternalLink, FileArchive, LoaderCircle, TerminalSquare, Upload } from 'lucide-react'
import {
  fetchProjectBuildJobLogs,
  fetchProjectDockerSummary,
  type ProjectDockerBuildJob,
  type ProjectDockerSummary,
  uploadProjectDockerSourceBuild,
} from '../lib/project-docker-api'
import { useToast } from './ToastProvider'
import { Progress } from './ui/progress'

interface ProjectDockerSourceBuildPanelProps {
  projectId: number
  currentUserName: string
  projectAuthor: string
  summary: ProjectDockerSummary
  onSummaryChange: (summary: ProjectDockerSummary) => void
}

function isSupportedSourceBundleName(fileName: string) {
  const normalized = fileName.trim().toLowerCase()
  return normalized.endsWith('.tar') || normalized.endsWith('.tar.gz') || normalized.endsWith('.tgz')
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return '-'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return '-'
  }

  return parsed.toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function buildJobStatusClass(status: string) {
  switch (status) {
    case 'completed':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    case 'failed':
      return 'border-rose-200 bg-rose-50 text-rose-700'
    case 'deploying':
      return 'border-sky-200 bg-sky-50 text-sky-700'
    case 'building':
    case 'extracting':
    case 'queued':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    default:
      return 'border-slate-200 bg-slate-100 text-slate-700'
  }
}

function formatBuildJobStatus(status: string) {
  switch (status) {
    case 'queued':
      return '대기 중'
    case 'extracting':
      return '압축 해제 중'
    case 'building':
      return '빌드 중'
    case 'deploying':
      return '배포 중'
    case 'completed':
      return '완료됨'
    case 'failed':
      return '실패'
    default:
      return status || '상태 미상'
  }
}

function hasActiveBuildJobs(buildJobs: ProjectDockerBuildJob[]) {
  return buildJobs.some((buildJob) => ['queued', 'extracting', 'building', 'deploying'].includes(buildJob.status))
}

export function ProjectDockerSourceBuildPanel({
  projectId,
  currentUserName,
  projectAuthor,
  summary,
  onSummaryChange,
}: ProjectDockerSourceBuildPanelProps) {
  const { error, info, success } = useToast()
  const [selectedSourceBundle, setSelectedSourceBundle] = useState<File | null>(null)
  const [selectedEnvironmentFile, setSelectedEnvironmentFile] = useState<File | null>(null)
  const [dockerfilePath, setDockerfilePath] = useState('Dockerfile')
  const [contextPath, setContextPath] = useState('.')
  const [imageName, setImageName] = useState('')
  const [imageTag, setImageTag] = useState('')
  const [containerPort, setContainerPort] = useState('')
  const [preferredHostPort, setPreferredHostPort] = useState('')
  const [environmentInput, setEnvironmentInput] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [loadingBuildJobId, setLoadingBuildJobId] = useState<number | null>(null)
  const [openedBuildJobId, setOpenedBuildJobId] = useState<number | null>(null)
  const [buildJobLogs, setBuildJobLogs] = useState('')

  const deploymentsById = useMemo(
    () => new Map(summary.deployments.map((deployment) => [deployment.id, deployment])),
    [summary.deployments],
  )
  const imagesById = useMemo(
    () => new Map(summary.images.map((image) => [image.id, image])),
    [summary.images],
  )
  const engineUnavailable = summary.runtime?.engineAvailable === false

  useEffect(() => {
    if (!hasActiveBuildJobs(summary.buildJobs)) {
      return
    }

    const timer = window.setInterval(async () => {
      try {
        const nextSummary = await fetchProjectDockerSummary(projectId, currentUserName)
        onSummaryChange(nextSummary)
      } catch {
        // Keep the existing state until the next refresh attempt succeeds.
      }
    }, 3000)

    return () => {
      window.clearInterval(timer)
    }
  }, [currentUserName, onSummaryChange, projectId, summary.buildJobs])

  async function handleUpload() {
    if (!selectedSourceBundle) {
      info('먼저 소스 번들을 선택해 주세요.')
      return
    }

    if (!currentUserName.trim()) {
      error('Docker 소스 빌드를 시작하려면 사용자 이름이 필요합니다.')
      return
    }

    if (!isSupportedSourceBundleName(selectedSourceBundle.name)) {
      error('소스 번들은 .tar, .tar.gz 또는 .tgz 형식이어야 합니다.')
      return
    }

    if (selectedEnvironmentFile && !/env/i.test(selectedEnvironmentFile.name)) {
      error('런타임 환경 파일은 .env 형식이어야 합니다.')
      return
    }

    const preferredPortValue = preferredHostPort.trim() ? Number.parseInt(preferredHostPort.trim(), 10) : null

    setIsUploading(true)
    setUploadProgress(0)

    try {
      const nextSummary = await uploadProjectDockerSourceBuild(projectId, selectedSourceBundle, {
        currentUserName,
        dockerfilePath,
        contextPath,
        imageName,
        imageTag,
        containerPort,
        preferredHostPort: Number.isFinite(preferredPortValue) ? preferredPortValue : null,
        environment: environmentInput,
        environmentFile: selectedEnvironmentFile,
        onProgress: (percent) => setUploadProgress(percent),
      })

      onSummaryChange(nextSummary)
      setSelectedSourceBundle(null)
      setSelectedEnvironmentFile(null)
      setDockerfilePath('Dockerfile')
      setContextPath('.')
      setImageName('')
      setImageTag('')
      setContainerPort('')
      setPreferredHostPort('')
      setEnvironmentInput('')
      setOpenedBuildJobId(null)
      setBuildJobLogs('')
      success('Docker 소스 빌드를 대기열에 등록했습니다.')
    } catch (uploadError) {
      error(uploadError instanceof Error ? uploadError.message : 'Docker 소스 빌드 업로드에 실패했습니다.')
    } finally {
      setIsUploading(false)
    }
  }

  async function handleLoadLogs(buildJobId: number) {
    if (openedBuildJobId === buildJobId) {
      setOpenedBuildJobId(null)
      setBuildJobLogs('')
      return
    }

    setLoadingBuildJobId(buildJobId)
    try {
      const logs = await fetchProjectBuildJobLogs(projectId, buildJobId, currentUserName)
      setBuildJobLogs(logs)
      setOpenedBuildJobId(buildJobId)
    } catch (logError) {
      error(logError instanceof Error ? logError.message : 'Docker 빌드 로그를 불러오지 못했습니다.')
    } finally {
      setLoadingBuildJobId(null)
    }
  }

  return (
    <div className="space-y-4">
      <section className="surface-panel overflow-hidden rounded-[28px]">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-900">소스 번들 빌드</h3>
          <p className="text-xs text-slate-500">
            Docker 빌드 컨텍스트가 포함된 tar 번들을 업로드하면 서버가 비동기로 이미지를 빌드하고 기존 런타임 흐름으로 배포합니다.
          </p>
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
          <div className="space-y-4">
            {engineUnavailable ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{summary.runtime?.engineError || 'Docker 엔진이 연결되지 않아 소스 빌드를 시작할 수 없습니다.'}</p>
                </div>
              </div>
            ) : null}

            <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[24px] border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center transition hover:border-slate-400 hover:bg-white">
              <input
                type="file"
                accept=".tar,.tar.gz,.tgz"
                className="sr-only"
                disabled={isUploading || engineUnavailable}
                onChange={(event) => {
                  setSelectedSourceBundle(event.currentTarget.files?.[0] ?? null)
                  event.currentTarget.value = ''
                }}
              />
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-[0_12px_28px_rgba(15,23,42,0.2)]">
                <FileArchive className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-base font-semibold text-slate-900">
                  {selectedSourceBundle ? selectedSourceBundle.name : '소스 번들 선택'}
                </p>
                <p className="text-sm text-slate-600">
                  {selectedSourceBundle
                    ? `${(selectedSourceBundle.size / 1024 / 1024).toFixed(2)} MB`
                    : '저장소 또는 빌드 컨텍스트를 tar, tar.gz, tgz로 묶어 업로드하세요.'}
                </p>
              </div>
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Dockerfile</span>
                <input
                  type="text"
                  value={dockerfilePath}
                  onChange={(event) => setDockerfilePath(event.target.value)}
                  placeholder="Dockerfile"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-slate-200 transition focus:border-slate-500 focus:ring-2"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">컨텍스트 경로</span>
                <input
                  type="text"
                  value={contextPath}
                  onChange={(event) => setContextPath(event.target.value)}
                  placeholder="."
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-slate-200 transition focus:border-slate-500 focus:ring-2"
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">이미지 이름</span>
                <input
                  type="text"
                  value={imageName}
                  onChange={(event) => setImageName(event.target.value)}
                  placeholder="선택 사항"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-slate-200 transition focus:border-slate-500 focus:ring-2"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">이미지 태그</span>
                <input
                  type="text"
                  value={imageTag}
                  onChange={(event) => setImageTag(event.target.value)}
                  placeholder="latest"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-slate-200 transition focus:border-slate-500 focus:ring-2"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">컨테이너 포트</span>
                <input
                  type="text"
                  value={containerPort}
                  onChange={(event) => setContainerPort(event.target.value)}
                  placeholder="8080 또는 8080/tcp"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-slate-200 transition focus:border-slate-500 focus:ring-2"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">호스트 포트</span>
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={preferredHostPort}
                  onChange={(event) => setPreferredHostPort(event.target.value)}
                  placeholder="자동"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-slate-200 transition focus:border-slate-500 focus:ring-2"
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 transition hover:border-slate-300 hover:bg-white">
                <input
                type="file"
                accept=".env,text/plain"
                className="sr-only"
                disabled={isUploading || engineUnavailable}
                onChange={(event) => {
                  setSelectedEnvironmentFile(event.currentTarget.files?.[0] ?? null)
                  event.currentTarget.value = ''
                  }}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {selectedEnvironmentFile ? selectedEnvironmentFile.name : '선택 런타임 env 파일'}
                  </p>
                  <p className="text-xs text-slate-500">빌드 시점이 아니라 배포 시점에 적용됩니다.</p>
                </div>
              </label>

              <button
                type="button"
                onClick={() => void handleUpload()}
                disabled={!selectedSourceBundle || isUploading || engineUnavailable}
                className="inline-flex items-center justify-center gap-2 self-end rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isUploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                빌드 대기열 등록
              </button>
            </div>

            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">런타임 환경 변수</span>
              <textarea
                rows={5}
                value={environmentInput}
                onChange={(event) => setEnvironmentInput(event.target.value)}
                placeholder={'API_KEY=example\nNODE_ENV=production'}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm text-slate-900 outline-none ring-slate-200 transition focus:border-slate-500 focus:ring-2"
              />
            </label>

            {isUploading ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span>업로드 진행률</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2.5 bg-white" />
              </div>
            ) : null}
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">현재 지원 범위</p>
                <p className="mt-1 text-sm text-slate-700">
                  1단계에서는 단일 Docker 빌드 컨텍스트만 지원합니다. 서버가 이미지 하나를 빌드하고 노출 포트를 확인한 뒤 현재 단일 런타임 흐름으로 배포합니다.
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">프로젝트 접근 권한</p>
                <p className="mt-1 text-sm text-slate-700">
                  현재 사용자: <span className="font-medium text-slate-900">{currentUserName || '-'}</span>
                </p>
                <p className="text-sm text-slate-700">
                  프로젝트 작성자: <span className="font-medium text-slate-900">{projectAuthor}</span>
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">참고</p>
                <p className="mt-1 text-sm text-slate-700">
                  이미지에 노출 포트가 없으면 `컨테이너 포트`를 직접 입력해 주세요.
                </p>
                <p className="text-sm text-slate-700">`docker-compose` 기반 소스 빌드는 아직 오케스트레이션하지 않습니다.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="surface-panel overflow-hidden rounded-[28px]">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-900">빌드 작업</h3>
          <p className="text-xs text-slate-500">이 프로젝트의 대기 중 및 완료된 소스 빌드입니다.</p>
        </div>

        <div className="space-y-4 p-5">
          {summary.buildJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
              <Boxes className="h-10 w-10 text-slate-300" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">아직 소스 빌드 작업이 없습니다.</p>
                <p className="text-sm text-slate-600">소스 번들을 업로드해 첫 빌드를 등록하세요.</p>
              </div>
            </div>
          ) : null}

          {summary.buildJobs.map((buildJob) => {
            const linkedImage = buildJob.imageRecordId ? imagesById.get(buildJob.imageRecordId) ?? null : null
            const linkedDeployment = buildJob.deploymentId ? deploymentsById.get(buildJob.deploymentId) ?? null : null
            const isLogsBusy = loadingBuildJobId === buildJob.id

            return (
              <div key={buildJob.id} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {buildJob.sourceFileName}
                      </span>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${buildJobStatusClass(buildJob.status)}`}>
                        {formatBuildJobStatus(buildJob.status)}
                      </span>
                    </div>

                    <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
                      <p>업로더: <span className="font-medium text-slate-900">{buildJob.uploaderName}</span></p>
                      <p>Dockerfile: <span className="font-medium text-slate-900">{buildJob.dockerfilePath}</span></p>
                      <p>컨텍스트: <span className="font-medium text-slate-900">{buildJob.contextPath}</span></p>
                      <p>포트: <span className="font-medium text-slate-900">{buildJob.requestedContainerPort || linkedDeployment?.containerPort || '-'}</span></p>
                    </div>

                    {buildJob.imageName || buildJob.imageTag || linkedImage?.imageReference ? (
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
                          이미지 {linkedImage?.imageReference || `${buildJob.imageName || 'auto'}:${buildJob.imageTag || 'latest'}`}
                        </span>
                        {buildJob.environmentFileName ? (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                            환경 파일 {buildJob.environmentFileName}
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    {linkedDeployment?.endpointUrl ? (
                      linkedDeployment.status === 'running' ? (
                        <a
                          href={linkedDeployment.endpointUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 text-sm font-medium text-sky-700 hover:text-sky-800"
                        >
                          <ExternalLink className="h-4 w-4" />
                          {linkedDeployment.endpointUrl}
                        </a>
                      ) : (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                          엔드포인트가 {linkedDeployment.endpointUrl}에 예약되어 있지만 현재 배포 상태는 {linkedDeployment.status}입니다.
                        </div>
                      )
                    ) : null}

                    {buildJob.errorMessage ? (
                      <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                        {buildJob.errorMessage}
                      </div>
                    ) : null}

                    {!buildJob.errorMessage && buildJob.buildOutputExcerpt ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        <p className="font-medium text-slate-900">최근 빌드 출력</p>
                        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-slate-700">
                          {buildJob.buildOutputExcerpt}
                        </pre>
                      </div>
                    ) : null}
                  </div>

                  <div className="min-w-[220px] space-y-2">
                    <button
                      type="button"
                      onClick={() => void handleLoadLogs(buildJob.id)}
                      disabled={!buildJob.canManage || isLogsBusy}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isLogsBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <TerminalSquare className="h-4 w-4" />}
                      {openedBuildJobId === buildJob.id ? '빌드 로그 숨기기' : '빌드 로그 보기'}
                    </button>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
                      <p>등록: {formatDateTime(buildJob.createdAt)}</p>
                      <p>시작: {formatDateTime(buildJob.startedAt)}</p>
                      <p>종료: {formatDateTime(buildJob.finishedAt)}</p>
                    </div>
                  </div>
                </div>

                {openedBuildJobId === buildJob.id ? (
                  <div className="mt-4 overflow-x-auto rounded-2xl bg-slate-950 p-4">
                    <pre className="text-sm leading-6 text-slate-100">
                      <code>{buildJobLogs || '아직 표시할 빌드 로그가 없습니다.'}</code>
                    </pre>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
