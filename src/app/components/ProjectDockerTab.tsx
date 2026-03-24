import { useEffect, useMemo, useState } from 'react'
import {
  ExternalLink,
  FileCode2,
  LoaderCircle,
  Package,
  Play,
  RefreshCcw,
  RotateCcw,
  Square,
  TerminalSquare,
  Upload,
} from 'lucide-react'
import {
  controlProjectDeployment,
  fetchProjectContainerBuildLogs,
  fetchProjectContainers,
  startProjectContainerBuild,
  uploadProjectDockerComposeFiles,
  type ProjectContainerDefinition,
  type ProjectContainerDeployment,
  type ProjectContainerOverview,
} from '../lib/project-docker-api'
import { useToast } from './ToastProvider'
import { Pill } from './common'
import { OpalButton } from './opal/OpalButton'
import { Progress } from './ui/progress'

interface ProjectDockerTabProps {
  projectId?: number
  currentUserName?: string
  canManage?: boolean
}

const MAIN_COMPOSE_DEFINITION_NAME = 'main'

function formatDateTime(value?: string | null) {
  if (!value) {
    return '-'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function buildStatusTone(status: string) {
  if (['failed', 'error', 'stopped'].includes(status)) {
    return 'bg-red-50 text-red-700 border-red-200'
  }
  if (status === 'running') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  }
  if (['queued', 'building', 'starting'].includes(status)) {
    return 'bg-amber-50 text-amber-700 border-amber-200'
  }
  return 'bg-slate-100 text-slate-700 border-slate-200'
}

function parseActivityTime(value?: string | null) {
  if (!value) {
    return 0
  }

  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? 0 : timestamp
}

function getDefinitionActivityTime(definition: ProjectContainerDefinition) {
  return Math.max(
    parseActivityTime(definition.activeDeployment?.updatedAt),
    parseActivityTime(definition.lastBuildJob?.finishedAt),
    parseActivityTime(definition.lastBuildJob?.startedAt),
    parseActivityTime(definition.lastBuildJob?.createdAt),
  )
}

function pickPrimaryComposeDefinition(definitions: ProjectContainerDefinition[]) {
  const composeDefinitions = definitions.filter((definition) => Boolean(definition.composeFilePath))
  if (composeDefinitions.length === 0) {
    return null
  }

  const mainDefinition = composeDefinitions.find((definition) => definition.name === MAIN_COMPOSE_DEFINITION_NAME)
  if (mainDefinition) {
    return mainDefinition
  }

  return [...composeDefinitions].sort((left, right) => {
    const timeDiff = getDefinitionActivityTime(right) - getDefinitionActivityTime(left)
    if (timeDiff !== 0) {
      return timeDiff
    }

    return left.name.localeCompare(right.name, 'en', { numeric: true })
  })[0]
}

function pickSelectedJobId(
  payload: ProjectContainerOverview,
  keepSelectedJob: boolean,
  currentJobId: number | null,
  definitionName: string | null,
) {
  if (!definitionName) {
    return null
  }

  const jobsForDefinition = payload.buildJobs.filter((job) => job.definitionName === definitionName)
  if (!keepSelectedJob) {
    return jobsForDefinition[0]?.id ?? null
  }

  if (currentJobId && jobsForDefinition.some((job) => job.id === currentJobId)) {
    return currentJobId
  }

  return jobsForDefinition[0]?.id ?? null
}

function getServiceEndpointLabel(deployment: ProjectContainerDeployment, serviceName?: string | null) {
  const normalizedServiceName = typeof serviceName === 'string' && serviceName.trim() ? serviceName.trim() : null
  if (normalizedServiceName) {
    return normalizedServiceName
  }

  return deployment.imageReference?.startsWith('compose:') ? '서비스' : '앱'
}

function formatStatusLabel(status?: string | null) {
  const normalizedStatus = typeof status === 'string' ? status.trim().toLowerCase() : ''

  switch (normalizedStatus) {
    case 'queued':
      return '대기 중'
    case 'building':
      return '빌드 중'
    case 'starting':
      return '시작 중'
    case 'running':
      return '실행 중'
    case 'stopped':
      return '중지됨'
    case 'failed':
      return '실패'
    case 'error':
      return '오류'
    default:
      return status ?? '-'
  }
}

function formatDockerAvailabilityLabel(available: boolean, version?: string | null, runtimeLabel?: string | null) {
  const label = typeof runtimeLabel === 'string' && runtimeLabel.trim() ? runtimeLabel.trim() : 'Docker Engine'
  return available ? `${label} 사용 가능${version ? ` (${version})` : ''}` : `${label} 사용 불가`
}

function formatDockerMessage(message?: string | null) {
  const trimmed = typeof message === 'string' ? message.trim() : ''
  if (!trimmed) {
    return ''
  }

  const normalizedMessage = trimmed.toLowerCase()
  const parseFailureMatch = trimmed.match(/^(.+?) could not be parsed\.$/i)
  if (parseFailureMatch) {
    return `${parseFailureMatch[1]} 파일을 해석하지 못했습니다.`
  }

  if (trimmed === 'jbhub.container.json or jbhub.container.yml is recommended.') {
    return 'jbhub.container.json 또는 jbhub.container.yml 파일 사용을 권장합니다.'
  }
  if (trimmed === '.dockerignore is recommended.') {
    return '.dockerignore 파일 사용을 권장합니다.'
  }
  if (trimmed === 'Compose file detected. Upload the matching tar archive contents for build context changes.') {
    return 'Compose 파일이 감지되었습니다. 빌드 컨텍스트가 필요하면 관련 파일을 tar 압축으로 함께 업로드해 주세요.'
  }
  if (trimmed === 'Container port could not be inferred. Add EXPOSE or container metadata.') {
    return '컨테이너 포트를 추론하지 못했습니다. EXPOSE 또는 컨테이너 메타데이터를 추가해 주세요.'
  }
  if (trimmed === 'Container port could not be inferred. Add EXPOSE or jbhub.container metadata.') {
    return '컨테이너 포트를 추론하지 못했습니다. EXPOSE 또는 jbhub.container 메타데이터를 추가해 주세요.'
  }
  if (trimmed === 'This Dockerfile uses COPY or ADD. Upload the matching context files before building.') {
    return '이 Dockerfile은 COPY 또는 ADD를 사용합니다. 빌드 전에 관련 컨텍스트 파일을 함께 업로드해 주세요.'
  }
  if (trimmed === 'Only the project author can manage containers.') {
    return '프로젝트 작성자만 컨테이너를 관리할 수 있습니다.'
  }
  if (trimmed === 'Upload Dockerfile + compose, compose + tar, or a Dockerfile.') {
    return 'Dockerfile + compose, compose + tar, 또는 Dockerfile만 업로드해 주세요.'
  }
  if (trimmed === 'Upload Dockerfile + compose, Dockerfile + compose + tar, compose + tar, or a Dockerfile.') {
    return 'Dockerfile + compose, Dockerfile + compose + tar, compose + tar, 또는 Dockerfile만 업로드해 주세요.'
  }
  if (trimmed === 'Upload both a compose file and a tar archive.') {
    return 'compose 파일과 tar 압축 파일을 함께 업로드해 주세요.'
  }
  if (trimmed === 'Container definition not found.') {
    return '컨테이너 정의를 찾을 수 없습니다.'
  }
  if (trimmed === 'Preview is not available.') {
    return '미리보기를 사용할 수 없습니다.'
  }
  if (trimmed === 'Preview service was not specified.') {
    return '미리보기 서비스가 지정되지 않았습니다.'
  }
  if (trimmed === 'Preview service is not available.') {
    return '미리보기 서비스를 사용할 수 없습니다.'
  }
  if (
    trimmed === 'Container runtime is unavailable.' ||
    trimmed === 'Docker engine is unavailable.' ||
    normalizedMessage.includes('failed to connect to the docker api') ||
    normalizedMessage.includes('cannot connect to the docker daemon') ||
    normalizedMessage.includes('dockerdesktoplinuxengine')
  ) {
    return 'Docker API에 연결하지 못했습니다. Docker 엔진 또는 Docker 데몬이 실행 중인지 확인해 주세요.'
  }
  if (normalizedMessage.includes('the system cannot find the file specified')) {
    return 'Docker 실행 경로를 찾지 못했습니다. Docker 엔진이 설치되어 있고 실행 중인지 확인해 주세요.'
  }

  return trimmed
}

function formatPortMappingLabel(containerPort?: number | null, hostPort?: number | null) {
  if (containerPort && hostPort) {
    return `컨테이너 ${containerPort} -> 호스트 ${hostPort}`
  }
  if (hostPort) {
    return `호스트 ${hostPort}`
  }

  return '외부로 공개된 포트를 찾지 못했습니다.'
}

function formatUploadSourceKind(kind?: string | null) {
  const normalizedKind = typeof kind === 'string' ? kind.trim().toLowerCase() : ''

  switch (normalizedKind) {
    case 'dockerfile':
      return 'Dockerfile'
    case 'compose':
      return 'Compose'
    case 'env':
      return '환경 파일'
    case 'nginx-config':
      return 'Nginx 설정'
    case 'context-tar':
      return '컨텍스트 tar'
    case 'archive':
      return '아카이브'
    case 'bundle-file':
      return '번들'
    default:
      return '파일'
  }
}

function formatUploadSourceName(kind: string, fileName: string, relativePath?: string | null) {
  if (kind === 'bundle-file' && typeof relativePath === 'string' && relativePath.trim()) {
    return relativePath.trim()
  }

  return fileName
}

export function ProjectDockerTab({
  projectId,
  currentUserName = '',
  canManage = false,
}: ProjectDockerTabProps) {
  const { error, success, info, warning } = useToast()
  const [overview, setOverview] = useState<ProjectContainerOverview | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null)
  const [selectedLogs, setSelectedLogs] = useState('')
  const [isLogLoading, setIsLogLoading] = useState(false)
  const [dockerfile, setDockerfile] = useState<File | null>(null)
  const [composeFile, setComposeFile] = useState<File | null>(null)
  const [envFile, setEnvFile] = useState<File | null>(null)
  const [nginxConfigFile, setNginxConfigFile] = useState<File | null>(null)
  const [contextTar, setContextTar] = useState<File | null>(null)
  const runtimeStatus = overview?.runtime ?? overview?.docker ?? null
  const isRuntimeLoading = isLoading && !overview && !runtimeStatus
  const hasContextTar = Boolean(contextTar)
  const hasEnvFile = Boolean(envFile)
  const hasNginxConfigFile = Boolean(nginxConfigFile)
  const hasSupplementalConfigFiles = hasEnvFile || hasNginxConfigFile
  const dockerComposeUploadLabel = hasContextTar ? '컨텍스트 업로드 후 바로 빌드' : '정의 갱신 후 바로 빌드'
  const dockerComposeUploadHint = hasContextTar
    ? '선택한 tar로 기존 빌드 컨텍스트를 교체한 뒤 바로 빌드를 시작합니다.'
    : 'tar를 비워두면 기존 빌드 컨텍스트를 유지하고 Dockerfile과 compose 정의만 교체합니다.'
  const dockerComposeSupportFileHint = hasSupplementalConfigFiles
    ? '선택한 env 파일은 .env로, nginx 설정 파일은 nginx.conf로 저장되어 compose와 Dockerfile에서 바로 참조할 수 있습니다.'
    : 'env 파일이나 nginx.conf가 있으면 함께 올릴 수 있고, 업로드하면 compose 옆에 저장됩니다.'

  async function loadOverview({ keepSelectedJob = true }: { keepSelectedJob?: boolean } = {}) {
    if (!projectId) {
      setOverview(null)
      return
    }

    setIsLoading(true)
    try {
      const payload = await fetchProjectContainers(projectId)
      const primaryDefinition = pickPrimaryComposeDefinition(payload.definitions)

      setOverview(payload)
      setSelectedJobId((currentJobId) =>
        pickSelectedJobId(payload, keepSelectedJob, currentJobId, primaryDefinition?.name ?? null),
      )
    } catch (loadError) {
      error(loadError instanceof Error ? formatDockerMessage(loadError.message) : '컨테이너 정보를 불러오지 못했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  async function refreshLogs(jobId: number | null = selectedJobId) {
    if (!jobId) {
      setSelectedLogs('')
      return
    }

    setIsLogLoading(true)
    try {
      const payload = await fetchProjectContainerBuildLogs(jobId)
      setSelectedLogs(payload.logs ?? '')
    } catch (loadError) {
      error(loadError instanceof Error ? formatDockerMessage(loadError.message) : '빌드 로그를 불러오지 못했습니다.')
    } finally {
      setIsLogLoading(false)
    }
  }

  useEffect(() => {
    void loadOverview({ keepSelectedJob: false })
  }, [projectId])

  useEffect(() => {
    void refreshLogs()
  }, [selectedJobId])

  const visibleDefinition = useMemo(
    () => pickPrimaryComposeDefinition(overview?.definitions ?? []),
    [overview?.definitions],
  )

  const composeDefinitions = useMemo(
    () => (overview?.definitions ?? []).filter((definition) => Boolean(definition.composeFilePath)),
    [overview?.definitions],
  )

  const hiddenComposeCount = Math.max(0, composeDefinitions.length - (visibleDefinition ? 1 : 0))
  const visibleUploadSources = useMemo(() => (visibleDefinition?.uploadSources ?? []).slice(0, 12), [visibleDefinition?.uploadSources])
  const hiddenUploadSourceCount = Math.max(0, (visibleDefinition?.uploadSources ?? []).length - visibleUploadSources.length)

  const hasActiveWork = useMemo(() => {
    if (!overview || !visibleDefinition) {
      return false
    }

    return (
      overview.buildJobs.some(
        (job) => job.definitionName === visibleDefinition.name && ['queued', 'building'].includes(job.status),
      ) ||
      overview.deployments.some(
        (deployment) => deployment.definitionName === visibleDefinition.name && deployment.status === 'starting',
      )
    )
  }, [overview, visibleDefinition])

  useEffect(() => {
    if (!hasActiveWork) {
      return
    }

    const timer = window.setInterval(() => {
      void loadOverview()
    }, 3000)

    return () => window.clearInterval(timer)
  }, [hasActiveWork, projectId])

  useEffect(() => {
    const selectedJob = overview?.buildJobs.find((job) => job.id === selectedJobId)
    if (!selectedJob || !visibleDefinition || selectedJob.definitionName !== visibleDefinition.name) {
      return
    }

    if (!['queued', 'building'].includes(selectedJob.status)) {
      return
    }

    const timer = window.setInterval(() => {
      void refreshLogs(selectedJobId)
    }, 2500)

    return () => window.clearInterval(timer)
  }, [overview, selectedJobId, visibleDefinition])

  async function handleDockerComposeUpload() {
    if (!projectId) {
      return
    }

    if (!canManage || !currentUserName.trim()) {
      warning('프로젝트 작성자만 Dockerfile과 compose 파일을 업로드할 수 있습니다.')
      return
    }

    if (!dockerfile || !composeFile) {
      warning('Dockerfile과 compose 파일을 모두 선택해 주세요.')
      return
    }

    setIsUploading(true)
    setUploadProgress(0)
    const willReplaceContext = Boolean(contextTar)
    const willUploadSupplementalFiles = Boolean(envFile || nginxConfigFile)

    try {
      await uploadProjectDockerComposeFiles(
        projectId,
        dockerfile,
        composeFile,
        {
          currentUserName,
          definitionName: MAIN_COMPOSE_DEFINITION_NAME,
          onProgress: setUploadProgress,
        },
        contextTar,
        envFile,
        nginxConfigFile,
      )

      const payload = await startProjectContainerBuild(
        projectId,
        {
          definitionName: MAIN_COMPOSE_DEFINITION_NAME,
          containerPort: null,
          preferredHostPort: null,
        },
        currentUserName,
      )

      const nextJobId = payload.job?.id ?? null
      if (nextJobId) {
        setSelectedJobId(nextJobId)
      }

      setDockerfile(null)
      setComposeFile(null)
      setEnvFile(null)
      setNginxConfigFile(null)
      setContextTar(null)
      success(
        willReplaceContext
          ? willUploadSupplementalFiles
            ? 'Dockerfile, compose, 추가 설정 파일, 컨텍스트를 업로드했고 자동 빌드와 사이트 미리보기를 시작했습니다.'
            : 'Dockerfile, compose, 컨텍스트를 업로드했고 자동 빌드와 사이트 미리보기를 시작했습니다.'
          : willUploadSupplementalFiles
            ? 'Dockerfile, compose, 추가 설정 파일을 업로드했고 기존 컨텍스트를 유지한 채 자동 빌드와 사이트 미리보기를 시작했습니다.'
            : 'Dockerfile과 compose를 업로드했고 기존 컨텍스트를 유지한 채 자동 빌드와 사이트 미리보기를 시작했습니다.',
      )
      await loadOverview()
      if (nextJobId) {
        await refreshLogs(nextJobId)
      }
    } catch (uploadError) {
      error(
        uploadError instanceof Error
          ? formatDockerMessage(uploadError.message)
          : 'Dockerfile과 compose 업로드 또는 자동 빌드 시작에 실패했습니다.',
      )
    } finally {
      setIsUploading(false)
    }
  }

  async function handleBuild(definition: ProjectContainerDefinition) {
    if (!projectId) {
      return
    }

    try {
      const payload = await startProjectContainerBuild(
        projectId,
        {
          definitionName: definition.name,
          containerPort: null,
          preferredHostPort: null,
        },
        currentUserName,
      )

      if (payload.job?.id) {
        setSelectedJobId(payload.job.id)
      }

      info('Docker 빌드와 미리보기를 시작했습니다.')
      await loadOverview()
    } catch (buildError) {
      error(buildError instanceof Error ? formatDockerMessage(buildError.message) : '컨테이너 빌드를 시작하지 못했습니다.')
    }
  }

  async function handleDeploymentAction(
    deployment: ProjectContainerDeployment,
    action: 'start' | 'stop' | 'restart',
  ) {
    if (!projectId) {
      return
    }

    try {
      await controlProjectDeployment(projectId, deployment.id, action, currentUserName)
      success(
        action === 'stop'
          ? '사이트 미리보기를 중지했습니다.'
          : action === 'restart'
            ? '사이트 미리보기를 다시 시작했습니다.'
            : '사이트 미리보기를 시작했습니다.',
      )
      await loadOverview()
    } catch (actionError) {
      error(actionError instanceof Error ? formatDockerMessage(actionError.message) : '배포 상태를 변경하지 못했습니다.')
    }
  }

  const selectedJob =
    overview?.buildJobs.find(
      (job) => job.id === selectedJobId && (!visibleDefinition || job.definitionName === visibleDefinition.name),
    ) ?? null

  const deployment = visibleDefinition?.activeDeployment ?? null
  const deploymentServiceEndpoints = useMemo(
    () =>
      (deployment?.serviceEndpoints ?? []).filter(
        (serviceEndpoint) => Boolean(serviceEndpoint.endpointUrl || serviceEndpoint.sitePreviewUrl),
      ),
    [deployment?.serviceEndpoints],
  )
  const primaryServiceEndpoint =
    deploymentServiceEndpoints.find((serviceEndpoint) => serviceEndpoint.isPrimary) ??
    deploymentServiceEndpoints[0] ??
    null
  const previewFrameUrl =
    primaryServiceEndpoint?.sitePreviewUrl ??
    primaryServiceEndpoint?.endpointUrl ??
    deployment?.sitePreviewUrl ??
    deployment?.endpointUrl ??
    undefined

  if (!projectId) {
    return (
      <div className="empty-panel">
        <p className="text-sm text-slate-600">컨테이너 기능을 보려면 먼저 프로젝트를 선택해 주세요.</p>
      </div>
    )
  }

  return (
    <section className="space-y-5">
      <div className="rounded-3xl border border-slate-200 bg-white/85 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-slate-700" />
              <h3 className="text-lg font-semibold text-slate-900">도커 컴포즈 미리보기</h3>
            </div>
            <p className="text-sm text-slate-600">
              Dockerfile과 compose를 올리면 같은 화면에서 바로 빌드합니다. tar 컨텍스트를 함께 올리면 빌드용 파일까지 교체하고 감지된 포트로
              사이트 미리보기를 띄웁니다.
            </p>
            <div className="flex flex-wrap gap-2">
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                  isRuntimeLoading
                    ? 'border-slate-200 bg-slate-100 text-slate-600'
                    : buildStatusTone(runtimeStatus?.available ? 'running' : 'failed')
                }`}
              >
                {isRuntimeLoading ? (
                  <>
                    <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Docker 엔진 상태 확인 중
                  </>
                ) : (
                  formatDockerAvailabilityLabel(
                    Boolean(runtimeStatus?.available),
                    runtimeStatus?.version,
                    runtimeStatus?.label,
                  )
                )}
              </span>
              {!isRuntimeLoading && runtimeStatus?.error ? <Pill variant="subtle">{formatDockerMessage(runtimeStatus.error)}</Pill> : null}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 md:hidden">
            모바일에서는 Docker 업로드를 숨겨두었습니다. 업로드와 빌드는 PC에서만 사용할 수 있습니다.
          </div>

          <div className="hidden min-w-[360px] flex-col gap-3 md:flex">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              업로드 대상은 항상 <span className="font-semibold text-slate-900">main</span> 입니다. Dockerfile과 compose만 올리면 기존
              컨텍스트를 유지하고 정의 파일만 교체합니다. env 파일과 nginx.conf를 함께 올리면 compose 옆의 루트 설정 파일을 갱신하고,
              tar까지 함께 올리면 컨텍스트도 새로 교체한 뒤 바로 빌드를 시작합니다.
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <label
                className={`rounded-2xl border border-dashed px-4 py-4 text-sm ${
                  canManage
                    ? 'cursor-pointer border-slate-300 bg-slate-50 text-slate-700 hover:border-slate-400'
                    : 'border-slate-200 bg-slate-100 text-slate-400'
                }`}
              >
                <input
                  type="file"
                  accept=".dockerfile,text/plain"
                  className="sr-only"
                  disabled={!canManage || isUploading}
                  onChange={(event) => setDockerfile(event.target.files?.[0] ?? null)}
                />
                <span className="flex items-center gap-2 font-medium">
                  <FileCode2 className="h-4 w-4" />
                  Dockerfile 선택
                </span>
                <span className="mt-1 block text-xs text-slate-500">{dockerfile?.name ?? 'Dockerfile'}</span>
              </label>

              <label
                className={`rounded-2xl border border-dashed px-4 py-4 text-sm ${
                  canManage
                    ? 'cursor-pointer border-slate-300 bg-slate-50 text-slate-700 hover:border-slate-400'
                    : 'border-slate-200 bg-slate-100 text-slate-400'
                }`}
              >
                <input
                  type="file"
                  accept=".yml,.yaml,text/yaml,text/x-yaml"
                  className="sr-only"
                  disabled={!canManage || isUploading}
                  onChange={(event) => setComposeFile(event.target.files?.[0] ?? null)}
                />
                <span className="flex items-center gap-2 font-medium">
                  <FileCode2 className="h-4 w-4" />
                  compose 파일 선택
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  {composeFile?.name ?? 'docker-compose.yml 또는 compose.yml'}
                </span>
              </label>
              <label
                className={`rounded-2xl border border-dashed px-4 py-4 text-sm ${
                  canManage
                    ? 'cursor-pointer border-slate-300 bg-slate-50 text-slate-700 hover:border-slate-400'
                    : 'border-slate-200 bg-slate-100 text-slate-400'
                }`}
              >
                <input
                  type="file"
                  accept=".env,text/plain"
                  className="sr-only"
                  disabled={!canManage || isUploading}
                  onChange={(event) => setEnvFile(event.target.files?.[0] ?? null)}
                />
                <span className="flex items-center gap-2 font-medium">
                  <FileCode2 className="h-4 w-4" />
                  env 파일 선택
                </span>
                <span className="mt-1 block text-xs text-slate-500">{envFile?.name ?? '선택 안 함: 기존 env 유지'}</span>
              </label>
              <label
                className={`rounded-2xl border border-dashed px-4 py-4 text-sm ${
                  canManage
                    ? 'cursor-pointer border-slate-300 bg-slate-50 text-slate-700 hover:border-slate-400'
                    : 'border-slate-200 bg-slate-100 text-slate-400'
                }`}
              >
                <input
                  type="file"
                  accept=".conf,text/plain"
                  className="sr-only"
                  disabled={!canManage || isUploading}
                  onChange={(event) => setNginxConfigFile(event.target.files?.[0] ?? null)}
                />
                <span className="flex items-center gap-2 font-medium">
                  <FileCode2 className="h-4 w-4" />
                  nginx.conf 선택
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  {nginxConfigFile?.name ?? '선택 안 함: 기존 nginx.conf 유지'}
                </span>
              </label>
              <label
                className={`rounded-2xl border border-dashed px-4 py-4 text-sm ${
                  canManage
                    ? 'cursor-pointer border-slate-300 bg-slate-50 text-slate-700 hover:border-slate-400'
                    : 'border-slate-200 bg-slate-100 text-slate-400'
                }`}
              >
                <input
                  type="file"
                  accept=".tar,application/x-tar,application/tar"
                  className="sr-only"
                  disabled={!canManage || isUploading}
                  onChange={(event) => setContextTar(event.target.files?.[0] ?? null)}
                />
                <span className="flex items-center gap-2 font-medium">
                  <Package className="h-4 w-4" />
                  컨텍스트 tar 선택
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  {contextTar?.name ?? '선택 안 함: 기존 컨텍스트 유지'}
                </span>
              </label>
            </div>

            <div className="flex flex-col items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <p className="text-xs leading-5 text-slate-600">{dockerComposeUploadHint}</p>
                <p className="text-xs leading-5 text-slate-500">{dockerComposeSupportFileHint}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {envFile ? (
                  <OpalButton variant="ghost" size="sm" disabled={isUploading} onClick={() => setEnvFile(null)}>
                    env 해제
                  </OpalButton>
                ) : null}
                {nginxConfigFile ? (
                  <OpalButton variant="ghost" size="sm" disabled={isUploading} onClick={() => setNginxConfigFile(null)}>
                    nginx 해제
                  </OpalButton>
                ) : null}
                {contextTar ? (
                  <OpalButton variant="ghost" size="sm" disabled={isUploading} onClick={() => setContextTar(null)}>
                    컨텍스트 해제
                  </OpalButton>
                ) : null}
              </div>
            </div>

            {isUploading ? <Progress value={uploadProgress} /> : null}

            <OpalButton
              variant="primary"
              size="sm"
              icon={isUploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              disabled={!canManage || isUploading || !dockerfile || !composeFile}
              onClick={() => void handleDockerComposeUpload()}
            >
              {dockerComposeUploadLabel}
            </OpalButton>

            <p className="text-xs leading-5 text-slate-500">
              compose의 `ports` 또는 `expose`, 없으면 Dockerfile의 `EXPOSE`를 기준으로 사이트 미리보기를 연결합니다. Dockerfile이 `COPY`나
              `ADD`를 쓰거나 compose가 다른 하위 경로를 빌드하면 tar 컨텍스트를 함께 올려 주세요.
            </p>
          </div>
        </div>
      </div>

      {!canManage ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          프로젝트 작성자만 Dockerfile과 compose 파일을 업로드하고 실행할 수 있습니다.
        </div>
      ) : null}

      {hiddenComposeCount > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          예전 테스트용 compose 정의 {hiddenComposeCount}개는 화면에서 숨겼습니다. 현재는 메인 정의 1개만 보여줍니다.
        </div>
      ) : null}

      {isLoading && !overview ? (
        <div className="empty-panel">
          <p className="flex items-center gap-2 text-sm text-slate-600">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            컨테이너 정보를 불러오는 중입니다.
          </p>
        </div>
      ) : null}

      {visibleDefinition ? (
        <div className="rounded-3xl border border-slate-200 bg-white/85 p-5 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
              <div>
                <h4 className="text-lg font-semibold text-slate-900">메인 컴포즈</h4>
                <p className="text-sm text-slate-500">{visibleDefinition.composeFilePath ?? visibleDefinition.dockerfilePath}</p>
                <p className="text-sm text-slate-500">{visibleDefinition.dockerfilePath}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Pill variant="subtle">컴포즈</Pill>
                {visibleDefinition.lastBuildJob ? (
                  <span
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${buildStatusTone(
                      visibleDefinition.lastBuildJob.status,
                    )}`}
                  >
                    빌드 {formatStatusLabel(visibleDefinition.lastBuildJob.status)}
                  </span>
                ) : null}
                {deployment ? (
                  <span
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${buildStatusTone(
                      deployment.status,
                    )}`}
                  >
                    미리보기 {formatStatusLabel(deployment.status)}
                  </span>
                ) : null}
                {deployment?.hostPort ? <Pill variant="subtle">호스트 {deployment.hostPort}</Pill> : null}
              </div>

              {visibleDefinition.warnings.length ? (
                <div className="space-y-1 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                  {visibleDefinition.warnings.map((warningMessage) => (
                    <p key={warningMessage}>{formatDockerMessage(warningMessage)}</p>
                  ))}
                </div>
              ) : null}

              {visibleDefinition.uploadSources.length ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">
                      {visibleDefinition.uploadRecordedAt ? '업로드 원본' : '포함 파일'}
                    </span>
                    {visibleDefinition.uploadRecordedAt ? (
                      <span className="text-slate-500">{formatDateTime(visibleDefinition.uploadRecordedAt)} 기준</span>
                    ) : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {visibleUploadSources.map((uploadSource) => (
                      <span
                        key={`${uploadSource.kind}-${uploadSource.relativePath ?? uploadSource.fileName}`}
                        className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700"
                      >
                        {`${formatUploadSourceKind(uploadSource.kind)} ${formatUploadSourceName(
                          uploadSource.kind,
                          uploadSource.fileName,
                          uploadSource.relativePath,
                        )}`}
                      </span>
                    ))}
                    {hiddenUploadSourceCount > 0 ? (
                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">
                        + {hiddenUploadSourceCount}개
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {deployment?.errorMessage ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  {formatDockerMessage(deployment.errorMessage)}
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 xl:min-w-[360px]">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Dockerfile과 compose 파일을 다시 올리지 않아도 여기서 재빌드, 재시작, 중지, 로그 확인을 할 수 있습니다.
              </div>

              <div className="flex flex-wrap gap-2">
                <OpalButton
                  size="sm"
                  variant="primary"
                  disabled={!canManage || !currentUserName.trim() || !runtimeStatus?.available}
                  icon={<Play className="h-4 w-4" />}
                  onClick={() => void handleBuild(visibleDefinition)}
                >
                  다시 빌드
                </OpalButton>

                {deployment ? (
                  <OpalButton
                    size="sm"
                    variant="secondary"
                    icon={<Square className="h-4 w-4" />}
                    onClick={() => void handleDeploymentAction(deployment, 'stop')}
                  >
                    중지
                  </OpalButton>
                ) : null}

                {deployment ? (
                  <OpalButton
                    size="sm"
                    variant="secondary"
                    icon={<RotateCcw className="h-4 w-4" />}
                    onClick={() => void handleDeploymentAction(deployment, 'restart')}
                  >
                    다시 시작
                  </OpalButton>
                ) : null}

                {visibleDefinition.lastBuildJob ? (
                  <OpalButton
                    size="sm"
                    variant="ghost"
                    icon={<TerminalSquare className="h-4 w-4" />}
                    onClick={() => setSelectedJobId(visibleDefinition.lastBuildJob?.id ?? null)}
                  >
                    로그 보기
                  </OpalButton>
                ) : null}

                {deploymentServiceEndpoints.length > 0
                  ? deploymentServiceEndpoints.map((serviceEndpoint) => (
                      <OpalButton
                        key={`${serviceEndpoint.serviceName ?? 'service'}-${serviceEndpoint.hostPort ?? 'port'}-direct`}
                        size="sm"
                        variant="ghost"
                        icon={<ExternalLink className="h-4 w-4" />}
                        onClick={() =>
                          window.open(
                            serviceEndpoint.sitePreviewUrl ?? serviceEndpoint.endpointUrl ?? undefined,
                            '_blank',
                            'noopener,noreferrer',
                          )
                        }
                      >
                        {`${getServiceEndpointLabel(deployment, serviceEndpoint.serviceName)} 열기`}
                      </OpalButton>
                    ))
                  : null}

                {deploymentServiceEndpoints.length === 0 && deployment?.endpointUrl ? (
                  <OpalButton
                    size="sm"
                    variant="ghost"
                    icon={<ExternalLink className="h-4 w-4" />}
                    onClick={() => window.open(deployment.endpointUrl ?? undefined, '_blank', 'noopener,noreferrer')}
                  >
                    로컬 열기
                  </OpalButton>
                ) : null}

                {deploymentServiceEndpoints.length === 0 && deployment?.sitePreviewUrl ? (
                  <OpalButton
                    size="sm"
                    variant="ghost"
                    icon={<ExternalLink className="h-4 w-4" />}
                    onClick={() => window.open(deployment.sitePreviewUrl ?? undefined, '_blank', 'noopener,noreferrer')}
                  >
                    사이트 미리보기
                  </OpalButton>
                ) : null}
              </div>
            </div>
          </div>

          {previewFrameUrl ? (
            <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
              <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                <span>업데이트 {formatDateTime(deployment.updatedAt)}</span>
                {deploymentServiceEndpoints.length > 0
                  ? deploymentServiceEndpoints.map((serviceEndpoint) => (
                      <span key={`${serviceEndpoint.serviceName ?? 'service'}-${serviceEndpoint.hostPort ?? 'port'}-meta`}>
                        {`${getServiceEndpointLabel(deployment, serviceEndpoint.serviceName)} ${serviceEndpoint.endpointUrl ?? serviceEndpoint.sitePreviewUrl ?? '-'}`}
                      </span>
                    ))
                  : null}
                {deploymentServiceEndpoints.length === 0 && deployment.endpointUrl ? <span>{deployment.endpointUrl}</span> : null}
                {deploymentServiceEndpoints.length === 0 && deployment.sitePreviewUrl ? <span>{deployment.sitePreviewUrl}</span> : null}
              </div>
              {deploymentServiceEndpoints.length > 0 ? (
                <div className="grid gap-2 md:grid-cols-2">
                  {deploymentServiceEndpoints.map((serviceEndpoint) => (
                    <div
                      key={`${serviceEndpoint.serviceName ?? 'service'}-${serviceEndpoint.hostPort ?? 'port'}-card`}
                      className="rounded-2xl border border-slate-200 bg-white/90 px-3 py-3 text-sm text-slate-600"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">
                          {getServiceEndpointLabel(deployment, serviceEndpoint.serviceName)}
                        </span>
                        {serviceEndpoint.isPrimary ? <Pill variant="subtle">기본</Pill> : null}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {serviceEndpoint.endpointUrl ?? serviceEndpoint.sitePreviewUrl ?? '-'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatPortMappingLabel(serviceEndpoint.containerPort, serviceEndpoint.hostPort)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <iframe
                  title="컴포즈 미리보기"
                  src={previewFrameUrl}
                  className="h-[420px] w-full bg-white"
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="empty-panel">
          <p className="text-sm text-slate-600">
            아직 업로드된 Docker Compose 정의가 없습니다. Dockerfile과 compose 파일을 올리면 바로 빌드와 미리보기를 시작합니다.
          </p>
        </div>
      )}

      <div className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white shadow-[0_20px_40px_rgba(15,23,42,0.18)]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">빌드 로그</p>
            <h4 className="text-lg font-semibold">
              {selectedJob ? `${selectedJob.definitionName} - ${formatStatusLabel(selectedJob.status)}` : '선택된 작업 없음'}
            </h4>
          </div>
          <OpalButton
            size="sm"
            variant="secondary"
            icon={<RefreshCcw className={`h-4 w-4 ${isLogLoading ? 'animate-spin' : ''}`} />}
            onClick={() => void refreshLogs()}
          >
            로그 새로고침
          </OpalButton>
        </div>
        <pre className="max-h-[360px] overflow-auto rounded-2xl bg-slate-900/90 p-4 text-xs leading-6 text-slate-200">
          {selectedLogs || '빌드 로그가 없습니다.'}
        </pre>
      </div>
    </section>
  )
}
