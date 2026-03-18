import { createPortal } from 'react-dom'
import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Boxes,
  ExternalLink,
  LoaderCircle,
  Package,
  Play,
  RefreshCcw,
  RotateCw,
  Server,
  Square,
  TerminalSquare,
  Trash2,
  Upload,
} from 'lucide-react'
import {
  fetchProjectDeploymentLogs,
  fetchProjectDockerSummary,
  removeProjectDockerImage,
  restartProjectDeployment,
  startProjectDeployment,
  stopProjectDeployment,
  type ProjectDockerDeployment,
  type ProjectDockerSummary,
  uploadProjectDockerImage,
} from '../lib/project-docker-api'
import { ProjectDockerSourceBuildPanel } from './ProjectDockerSourceBuildPanel'
import { useToast } from './ToastProvider'
import { Progress } from './ui/progress'

interface ProjectDockerTabProps {
  projectId: number
  currentUserName: string
  projectAuthor: string
}

function isSupportedDockerArchiveName(fileName: string) {
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

function deploymentStatusClass(status: string) {
  switch (status) {
    case 'running':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    case 'exited':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    case 'failed':
    case 'removed':
      return 'border-rose-200 bg-rose-50 text-rose-700'
    default:
      return 'border-slate-200 bg-slate-100 text-slate-700'
  }
}

function formatDeploymentStatus(status: string) {
  switch (status) {
    case 'running':
      return '실행 중'
    case 'exited':
      return '중지됨'
    case 'failed':
      return '실패'
    case 'removed':
      return '제거됨'
    case 'creating':
      return '생성 중'
    case 'restarting':
      return '재시작 중'
    default:
      return status || '상태 미상'
  }
}

function loadStatusClass(status: string) {
  switch (status) {
    case 'built':
    case 'loaded':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    case 'load_failed':
      return 'border-rose-200 bg-rose-50 text-rose-700'
    default:
      return 'border-slate-200 bg-slate-100 text-slate-700'
  }
}

function formatLoadStatus(status: string) {
  switch (status) {
    case 'built':
      return '소스 빌드됨'
    case 'loaded':
      return '로드 완료'
    case 'load_failed':
      return '로드 실패'
    case 'uploaded':
      return '업로드 완료'
    default:
      return status || '상태 미상'
  }
}

export function ProjectDockerTab({ projectId, currentUserName, projectAuthor }: ProjectDockerTabProps) {
  const { error, info, success } = useToast()
  const [summary, setSummary] = useState<ProjectDockerSummary>({ images: [], deployments: [], buildJobs: [] })
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedEnvironmentFile, setSelectedEnvironmentFile] = useState<File | null>(null)
  const [selectedComposeFile, setSelectedComposeFile] = useState<File | null>(null)
  const [preferredHostPort, setPreferredHostPort] = useState('')
  const [environmentInput, setEnvironmentInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [actingDeploymentId, setActingDeploymentId] = useState<number | null>(null)
  const [loadingLogsDeploymentId, setLoadingLogsDeploymentId] = useState<number | null>(null)
  const [openedLogsDeploymentId, setOpenedLogsDeploymentId] = useState<number | null>(null)
  const [deploymentLogs, setDeploymentLogs] = useState('')

  const deploymentsByImageId = useMemo(() => {
    const next = new Map<number, ProjectDockerDeployment[]>()
    for (const deployment of summary.deployments) {
      const group = next.get(deployment.imageId) ?? []
      group.push(deployment)
      next.set(deployment.imageId, group)
    }
    return next
  }, [summary.deployments])

  const runningCount = summary.deployments.filter((deployment) => deployment.status === 'running').length
  const engineUnavailable = summary.runtime?.engineAvailable === false
  const runtimeVersionLabel = summary.runtime?.dockerVersion || (engineUnavailable ? '연결 안 됨' : '확인 중')

  async function refreshSummary() {
    setIsLoading(true)
    try {
      const nextSummary = await fetchProjectDockerSummary(projectId, currentUserName)
      setSummary(nextSummary)
    } catch (loadError) {
      error(loadError instanceof Error ? loadError.message : '도커 실행 상태를 불러오지 못했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void refreshSummary()
  }, [projectId, currentUserName])

  useEffect(() => {
    if (!isUploading) {
      return
    }

    const previousBodyOverflow = document.body.style.overflow
    const previousHtmlOverflow = document.documentElement.style.overflow

    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousHtmlOverflow
    }
  }, [isUploading])

  async function handleUpload() {
    if (!selectedFile) {
      info('먼저 Docker 이미지 아카이브 파일을 선택해 주세요.')
      return
    }

    if (!currentUserName.trim()) {
      error('Docker 이미지를 업로드하려면 사용자 이름이 필요합니다.')
      return
    }

    if (!isSupportedDockerArchiveName(selectedFile.name)) {
      error('.tar, .tar.gz 또는 .tgz 형식의 Docker 이미지 아카이브만 업로드할 수 있습니다.')
      return
    }

    if (selectedEnvironmentFile && !/env/i.test(selectedEnvironmentFile.name)) {
      error('.env 형식의 환경 설정 파일만 업로드할 수 있습니다.')
      return
    }

    if (selectedComposeFile && !/\.ya?ml$/i.test(selectedComposeFile.name)) {
      error('docker-compose.yml 또는 .yaml/.yml 파일만 업로드할 수 있습니다.')
      return
    }

    const preferredPortValue = preferredHostPort.trim() ? Number.parseInt(preferredHostPort.trim(), 10) : null

    setIsUploading(true)
    setUploadProgress(0)

    try {
      const nextSummary = await uploadProjectDockerImage(projectId, selectedFile, {
        currentUserName,
        preferredHostPort: Number.isFinite(preferredPortValue) ? preferredPortValue : null,
        environment: environmentInput,
        environmentFile: selectedEnvironmentFile,
        composeFile: selectedComposeFile,
        onProgress: (percent) => setUploadProgress(percent),
      })

      setSummary(nextSummary)
      setSelectedFile(null)
      setSelectedEnvironmentFile(null)
      setSelectedComposeFile(null)
      setPreferredHostPort('')
      setEnvironmentInput('')
      setDeploymentLogs('')
      setOpenedLogsDeploymentId(null)
      success('Docker 이미지 업로드를 완료했습니다.')
    } catch (uploadError) {
      error(uploadError instanceof Error ? uploadError.message : 'Docker 이미지 업로드에 실패했습니다.')
    } finally {
      setIsUploading(false)
    }
  }

  async function handleDeploymentAction(
    deploymentId: number,
    action: 'start' | 'stop' | 'restart',
    successMessage: string,
  ) {
    setActingDeploymentId(deploymentId)

    try {
      let nextSummary: ProjectDockerSummary
      if (action === 'start') {
        nextSummary = await startProjectDeployment(projectId, deploymentId, currentUserName)
      } else if (action === 'stop') {
        nextSummary = await stopProjectDeployment(projectId, deploymentId, currentUserName)
      } else {
        nextSummary = await restartProjectDeployment(projectId, deploymentId, currentUserName)
      }

      setSummary(nextSummary)
      success(successMessage)
    } catch (actionError) {
      error(actionError instanceof Error ? actionError.message : '배포 상태 변경에 실패했습니다.')
    } finally {
      setActingDeploymentId(null)
    }
  }

  async function handleRemoveImage(imageId: number) {
    try {
      const nextSummary = await removeProjectDockerImage(projectId, imageId, currentUserName)
      setSummary(nextSummary)
      if (openedLogsDeploymentId) {
        setOpenedLogsDeploymentId(null)
        setDeploymentLogs('')
      }
      success('Docker 이미지를 삭제했습니다.')
    } catch (removeError) {
      error(removeError instanceof Error ? removeError.message : 'Docker 이미지 삭제에 실패했습니다.')
    }
  }

  async function handleLoadLogs(deploymentId: number) {
    if (openedLogsDeploymentId === deploymentId) {
      setOpenedLogsDeploymentId(null)
      setDeploymentLogs('')
      return
    }

    setLoadingLogsDeploymentId(deploymentId)
    try {
      const logs = await fetchProjectDeploymentLogs(projectId, deploymentId, currentUserName)
      setDeploymentLogs(logs)
      setOpenedLogsDeploymentId(deploymentId)
    } catch (logError) {
      error(logError instanceof Error ? logError.message : '배포 로그를 불러오지 못했습니다.')
    } finally {
      setLoadingLogsDeploymentId(null)
    }
  }

  const uploadOverlay =
    isUploading && typeof document !== 'undefined'
      ? createPortal(
          <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/72 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-[28px] border border-white/15 bg-slate-950/92 px-5 py-5 text-white shadow-[0_28px_80px_rgba(0,0,0,0.45)]">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/12 text-white">
                  <LoaderCircle className="h-5 w-5 animate-spin" />
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-white">이미지를 업로드하고 배포하는 중입니다</p>
                    <p className="text-sm text-slate-300">업로드한 아카이브를 로컬 Docker 엔진에 로드하고 컨테이너를 시작하고 있습니다.</p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                      <span>진행률</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <Progress value={uploadProgress} className="h-2.5 bg-white/15" />
                  </div>
                  <p className="text-xs text-slate-400">배포가 끝날 때까지 화면 조작이 잠깁니다.</p>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <div className="space-y-4" aria-busy={isUploading}>
      {uploadOverlay}

      <section className="page-panel space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-slate-900">Docker 실행 환경</h2>
            <p className="text-sm text-slate-600">
              Docker 이미지 아카이브를 올리면 로컬 Docker 엔진에 즉시 로드하고 바로 배포합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshSummary()}
            disabled={isLoading || isUploading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>

        {engineUnavailable ? (
          <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div className="space-y-2">
                <p className="font-semibold">Docker 엔진에 연결되지 않아 이미지 업로드와 배포 조작이 비활성화됩니다.</p>
                <p>{summary.runtime?.engineError || 'Docker 엔진 연결 상태를 확인하지 못했습니다.'}</p>
                <p className="text-xs text-amber-700">
                  폐쇄망에서는 `docker compose -f docker-compose.airgap.yml -f docker-compose.airgap.docker-features.yml up -d`
                  형태로 Docker 기능 override를 함께 올려야 합니다.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
          <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,248,252,0.92))] p-5 shadow-[0_18px_40px_rgba(12,35,58,0.08)]">
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">아카이브 업로드</p>
                <p className="text-sm text-slate-600">
                  지원 형식은 `.tar`, `.tar.gz`, `.tgz`이며 단일 이미지면 첫 번째 노출 포트를 자동 공개하고, compose 파일이 있으면 compose 배포로 실행합니다.
                </p>
              </div>

              <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[24px] border-2 border-dashed border-slate-300 bg-white px-6 py-10 text-center transition hover:border-slate-400 hover:bg-slate-50">
                <input
                  type="file"
                  accept=".tar,.tar.gz,.tgz"
                  className="sr-only"
                  disabled={isUploading}
                  onChange={(event) => {
                    setSelectedFile(event.currentTarget.files?.[0] ?? null)
                    event.currentTarget.value = ''
                  }}
                />
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-[0_12px_28px_rgba(15,23,42,0.2)]">
                  <Upload className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-base font-semibold text-slate-900">
                    {selectedFile ? selectedFile.name : 'Docker 이미지 아카이브 선택'}
                  </p>
                  <p className="text-sm text-slate-600">
                    {selectedFile
                      ? `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB`
                      : '미리 빌드된 Docker 이미지 아카이브를 업로드하세요.'}
                  </p>
                </div>
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">환경 변수</span>
                <textarea
                  rows={5}
                  value={environmentInput}
                  onChange={(event) => setEnvironmentInput(event.target.value)}
                  placeholder={'ADMIN_PASSWORD=ChangeMe123!\nAPI_KEY=your-secret'}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm text-slate-900 outline-none ring-slate-200 transition focus:border-slate-500 focus:ring-2"
                />
                <p className="text-xs text-slate-500">한 줄에 하나씩 `KEY=VALUE` 형식으로 입력해 주세요. 이미지가 부팅할 때 필요한 값만 넣으면 됩니다.</p>
              </label>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 transition hover:border-slate-300 hover:bg-white">
                  <input
                    type="file"
                    accept=".env,text/plain"
                    className="sr-only"
                    disabled={isUploading}
                    onChange={(event) => {
                      setSelectedEnvironmentFile(event.currentTarget.files?.[0] ?? null)
                      event.currentTarget.value = ''
                    }}
                  />
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm">
                    <Package className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {selectedEnvironmentFile ? selectedEnvironmentFile.name : '.env 파일 선택'}
                    </p>
                    <p className="text-xs text-slate-500">환경 변수를 자동으로 읽어 컨테이너 실행에 적용합니다.</p>
                  </div>
                </label>

                <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 transition hover:border-slate-300 hover:bg-white">
                  <input
                    type="file"
                    accept=".yml,.yaml,text/yaml,text/x-yaml"
                    className="sr-only"
                    disabled={isUploading}
                    onChange={(event) => {
                      setSelectedComposeFile(event.currentTarget.files?.[0] ?? null)
                      event.currentTarget.value = ''
                    }}
                  />
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm">
                    <Boxes className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {selectedComposeFile ? selectedComposeFile.name : 'compose 파일 선택'}
                    </p>
                    <p className="text-xs text-slate-500">compose 의존형 프로젝트는 이 파일을 함께 올려야 다중 서비스를 compose로 배포합니다.</p>
                  </div>
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">호스트 포트</span>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={preferredHostPort}
                    onChange={(event) => setPreferredHostPort(event.target.value)}
                    placeholder="비워두면 자동 배정"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-slate-200 transition focus:border-slate-500 focus:ring-2"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => void handleUpload()}
                  disabled={!selectedFile || isUploading || engineUnavailable}
                  className="inline-flex items-center justify-center gap-2 self-end rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isUploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  업로드 후 배포
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="surface-panel rounded-[24px] p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">이미지</p>
                  <p className="text-xl font-semibold text-slate-900">{summary.images.length}</p>
                </div>
              </div>
            </div>

            <div className="surface-panel rounded-[24px] p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                  <Server className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">실행 중</p>
                  <p className="text-xl font-semibold text-slate-900">{runningCount}</p>
                </div>
              </div>
            </div>

            <div className="surface-panel rounded-[24px] p-4 sm:col-span-2 lg:col-span-1">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">런타임</p>
                <p className="text-sm text-slate-700">Docker 서버 버전 {runtimeVersionLabel}</p>
                <p className="text-xs text-slate-500">현재 사용자 {currentUserName || '없음'} / 프로젝트 작성자 {projectAuthor}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <ProjectDockerSourceBuildPanel
        projectId={projectId}
        currentUserName={currentUserName}
        projectAuthor={projectAuthor}
        summary={summary}
        onSummaryChange={setSummary}
      />

      <section className="surface-panel overflow-hidden rounded-[28px]">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">업로드된 이미지</h3>
            <p className="text-xs text-slate-500">업로드할 때마다 이미지 레코드가 생성되고 즉시 배포를 시도합니다.</p>
          </div>
        </div>

        <div className="space-y-4 p-5">
          {summary.images.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-center">
              <Boxes className="h-10 w-10 text-slate-300" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">아직 업로드된 Docker 이미지가 없습니다.</p>
                <p className="text-sm text-slate-600">Docker 이미지 아카이브를 올리면 이미지 레코드를 만들고 컨테이너를 자동으로 실행합니다.</p>
              </div>
            </div>
          ) : null}

          {summary.images.map((image) => {
            const deployment = deploymentsByImageId.get(image.id)?.[0] ?? null
            const isDeploymentBusy = actingDeploymentId === deployment?.id
            const isLogsBusy = loadingLogsDeploymentId === deployment?.id

            return (
              <div key={image.id} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {image.imageReference || image.imageName || image.originalFileName}
                      </span>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${loadStatusClass(image.loadStatus)}`}>
                        {formatLoadStatus(image.loadStatus)}
                      </span>
                      {deployment ? (
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${deploymentStatusClass(deployment.status)}`}>
                          {formatDeploymentStatus(deployment.status)}
                        </span>
                      ) : null}
                    </div>

                    <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
                      <p>업로더: <span className="font-medium text-slate-900">{image.uploaderName}</span></p>
                      <p>크기: <span className="font-medium text-slate-900">{image.sizeFormatted}</span></p>
                      <p>레이어: <span className="font-medium text-slate-900">{image.layers}</span></p>
                      <p>아키텍처: <span className="font-medium text-slate-900">{image.architecture || '-'}</span></p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {image.exposedPorts.length > 0 ? (
                        image.exposedPorts.map((port) => (
                          <span key={port} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
                            노출 포트 {port}
                          </span>
                        ))
                      ) : (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
                          노출된 컨테이너 포트 없음
                        </span>
                      )}
                    </div>

                    {image.bundleReferences.length > 1 ? (
                      <div className="flex flex-wrap gap-2">
                        {image.bundleReferences.map((reference) => (
                          <span key={reference} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
                            아카이브 이미지 {reference}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {image.environmentFileName || image.composeFileName || image.composeServices.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {image.environmentFileName ? (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                            환경 파일 {image.environmentFileName}
                          </span>
                        ) : null}
                        {image.composeFileName ? (
                          <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
                            컴포즈 {image.composeFileName}
                          </span>
                        ) : null}
                        {image.composeServices.map((serviceName) => (
                          <span key={serviceName} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
                            서비스 {serviceName}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {image.bundleReferences.length > 1 && !image.composeFileName ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                        이 아카이브에는 여러 이미지가 들어 있지만 compose 파일이 없어 주 이미지 1개 기준으로만 자동 배포합니다. compose 의존형 프로젝트라면 `docker-compose.yml`을 함께 업로드해야 합니다.
                      </div>
                    ) : null}

                    {deployment?.endpointUrl && deployment.status === 'running' ? (
                      <a
                        href={deployment.endpointUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 text-sm font-medium text-sky-700 hover:text-sky-800"
                      >
                        <ExternalLink className="h-4 w-4" />
                        {deployment.endpointUrl}
                      </a>
                    ) : null}

                    {deployment?.endpointUrl && deployment.status !== 'running' ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                        엔드포인트 {deployment.endpointUrl}가 배정되어 있지만 컨테이너는 현재 {formatDeploymentStatus(deployment.status)} 상태입니다. 로그와 필수 환경 변수를 확인해 주세요.
                      </div>
                    ) : null}

                    {image.loadError ? (
                      <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                        {image.loadError}
                      </div>
                    ) : null}

                    {deployment?.errorMessage ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                        {deployment.errorMessage}
                      </div>
                    ) : null}
                  </div>

                  <div className="min-w-[220px] space-y-2">
                    <div className="grid gap-2">
                      <button
                        type="button"
                        onClick={() => deployment && void handleDeploymentAction(deployment.id, 'start', '배포를 시작했습니다.')}
                        disabled={!deployment || !deployment.canManage || isDeploymentBusy || deployment.status === 'running'}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isDeploymentBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                        시작
                      </button>

                      <button
                        type="button"
                        onClick={() => deployment && void handleDeploymentAction(deployment.id, 'stop', '배포를 중지했습니다.')}
                        disabled={!deployment || !deployment.canManage || isDeploymentBusy || deployment.status === 'exited'}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isDeploymentBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                        중지
                      </button>

                      <button
                        type="button"
                        onClick={() => deployment && void handleDeploymentAction(deployment.id, 'restart', '배포를 재시작했습니다.')}
                        disabled={!deployment || !deployment.canManage || isDeploymentBusy}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isDeploymentBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
                        재시작
                      </button>

                      <button
                        type="button"
                        onClick={() => deployment && void handleLoadLogs(deployment.id)}
                        disabled={!deployment || !deployment.canManage || isLogsBusy}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isLogsBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <TerminalSquare className="h-4 w-4" />}
                        {openedLogsDeploymentId === deployment?.id ? '로그 숨기기' : '로그 보기'}
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleRemoveImage(image.id)}
                        disabled={!image.canManage}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        이미지 삭제
                      </button>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
                      <p>업로드: {formatDateTime(image.createdAt)}</p>
                      <p>최근 갱신: {formatDateTime(image.updatedAt)}</p>
                      <p>시작 시각: {deployment ? formatDateTime(deployment.startedAt) : '-'}</p>
                    </div>
                  </div>
                </div>

                {deployment && openedLogsDeploymentId === deployment.id ? (
                  <div className="mt-4 overflow-x-auto rounded-2xl bg-slate-950 p-4">
                    <pre className="text-sm leading-6 text-slate-100">
                      <code>{deploymentLogs || '아직 표시할 로그가 없습니다.'}</code>
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
