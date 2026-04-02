import { useEffect, useMemo, useState } from 'react'
import { Activity, Boxes, DatabaseZap, Loader2, Plus, ShieldCheck, ShieldEllipsis } from 'lucide-react'
import { useToast } from '../ToastProvider'
import { OpalButton } from '../opal'
import { Pill } from '../common'
import {
  createAirgapBaseImage,
  fetchAirgapAuditLogs,
  fetchAirgapBaseImages,
  fetchAirgapBuildHistory,
  fetchAirgapSystemStats,
  fetchAirgapWorkers,
  type AdminSession,
  type AirgapAuditLogEntry,
  type AirgapBaseImage,
  type AirgapBuildSummary,
  type AirgapSystemStats,
  type AirgapWorkerStatus,
} from '../../lib/admin-api'

interface AdminAirgapOperationsPanelProps {
  session: AdminSession
}

function formatDate(value?: string | null) {
  if (!value) {
    return '-'
  }

  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? value : new Date(parsed).toLocaleString('ko-KR')
}

function formatBytes(value?: number | null) {
  if (!value || value <= 0) return '0 B'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function formatBuildStatus(status?: string | null) {
  const normalized = String(status ?? '').toUpperCase()
  if (!normalized) {
    return '-'
  }

  const labelMap: Record<string, string> = {
    QUEUED: 'Queued',
    VALIDATING: 'Validating',
    BUILDING: 'Building',
    SCANNING: 'Scanning',
    PUSHING: 'Pushing',
    COMPLETED: 'Completed',
    REJECTED: 'Rejected',
    FAILED: 'Failed',
    PUSH_BLOCKED: 'Push blocked',
    CANCELLED: 'Cancelled',
  }

  return labelMap[normalized] ?? normalized
}

function getBuildTone(status?: string | null) {
  const normalized = String(status ?? '').toUpperCase()
  if (normalized === 'COMPLETED') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  }
  if (['FAILED', 'REJECTED', 'PUSH_BLOCKED', 'CANCELLED'].includes(normalized)) {
    return 'border-red-200 bg-red-50 text-red-700'
  }
  return 'border-amber-200 bg-amber-50 text-amber-700'
}

function summarizeAuditDetail(detail: unknown) {
  if (!detail || typeof detail !== 'object') {
    return '-'
  }

  const value = detail as Record<string, unknown>
  if (typeof value.imageName === 'string') {
    const tag = typeof value.tag === 'string' ? `:${value.tag}` : ''
    return `${value.imageName}${tag}`
  }
  if (typeof value.imageRef === 'string') {
    return value.imageRef
  }
  if (typeof value.reason === 'string') {
    return value.reason
  }

  const firstEntry = Object.entries(value)[0]
  if (!firstEntry) {
    return '-'
  }

  return `${firstEntry[0]}: ${String(firstEntry[1])}`
}

export function AdminAirgapOperationsPanel({ session }: AdminAirgapOperationsPanelProps) {
  const toast = useToast()
  const [stats, setStats] = useState<AirgapSystemStats | null>(null)
  const [workers, setWorkers] = useState<AirgapWorkerStatus[]>([])
  const [baseImages, setBaseImages] = useState<AirgapBaseImage[]>([])
  const [builds, setBuilds] = useState<AirgapBuildSummary[]>([])
  const [auditLogs, setAuditLogs] = useState<AirgapAuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [createForm, setCreateForm] = useState({
    imageRef: '',
    description: '',
  })

  const blockedBuilds = useMemo(
    () => builds.filter((build) => ['REJECTED', 'PUSH_BLOCKED', 'FAILED'].includes(String(build.status).toUpperCase())).length,
    [builds],
  )

  async function refreshAll(silent = false) {
    if (!silent) {
      setRefreshing(true)
    }

    try {
      const [nextStats, nextWorkers, nextBaseImages, nextBuilds, nextAuditLogs] = await Promise.all([
        fetchAirgapSystemStats(session),
        fetchAirgapWorkers(session),
        fetchAirgapBaseImages(session),
        fetchAirgapBuildHistory(session, 30),
        fetchAirgapAuditLogs(session, 30),
      ])

      setStats(nextStats)
      setWorkers(nextWorkers)
      setBaseImages(nextBaseImages)
      setBuilds(nextBuilds)
      setAuditLogs(nextAuditLogs)
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const [nextStats, nextWorkers, nextBaseImages, nextBuilds, nextAuditLogs] = await Promise.all([
          fetchAirgapSystemStats(session),
          fetchAirgapWorkers(session),
          fetchAirgapBaseImages(session),
          fetchAirgapBuildHistory(session, 30),
          fetchAirgapAuditLogs(session, 30),
        ])

        if (cancelled) {
          return
        }

        setStats(nextStats)
        setWorkers(nextWorkers)
        setBaseImages(nextBaseImages)
        setBuilds(nextBuilds)
        setAuditLogs(nextAuditLogs)
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Air-gapped operations data could not be loaded.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [session, toast])

  async function handleCreateBaseImage() {
    const imageRef = createForm.imageRef.trim()
    if (!imageRef) {
      toast.error('Image reference is required.')
      return
    }

    try {
      await createAirgapBaseImage(session, {
        imageRef,
        description: createForm.description.trim(),
      })
      setCreateForm({ imageRef: '', description: '' })
      await refreshAll(true)
      toast.success('Allowed base image was added.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Allowed base image could not be added.')
    }
  }

  return (
    <div className="admin-tab-shell">
      <div className="page-panel flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-bold">Air-gapped build operations</h2>
          <p className="mt-1 text-sm text-slate-500">
            Monitor worker state, approved base images, recent builds, and chained audit records for the isolated build flow.
          </p>
        </div>
        <OpalButton
          variant="secondary"
          size="sm"
          onClick={() => void refreshAll()}
          icon={refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
        >
          Refresh airgap
        </OpalButton>
      </div>

      <div className="page-panel">
        <div className="page-summary-strip">
          <div className="page-summary-item">
            <span className="page-summary-label">Total builds</span>
            <span className="page-summary-value">{stats?.totalBuilds ?? 0}</span>
          </div>
          <div className="page-summary-item">
            <span className="page-summary-label">Running</span>
            <span className="page-summary-value">{stats?.runningBuilds ?? 0}</span>
          </div>
          <div className="page-summary-item">
            <span className="page-summary-label">Blocked/Failed</span>
            <span className="page-summary-value">{blockedBuilds}</span>
          </div>
          <div className="page-summary-item">
            <span className="page-summary-label">Base images</span>
            <span className="page-summary-value">{stats?.activeBaseImages ?? baseImages.length}</span>
          </div>
          <div className="page-summary-item">
            <span className="page-summary-label">Audit logs</span>
            <span className="page-summary-value">{stats?.auditLogCount ?? auditLogs.length}</span>
          </div>
        </div>
      </div>

      <div className="dashboard-panel-grid-wide">
        <div className="space-y-4">
          <div className="page-panel">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold">Workers</h3>
                <p className="text-sm text-slate-500">Queue length and active execution state.</p>
              </div>
              <Pill variant="subtle">{workers.length}</Pill>
            </div>
            <div className="mt-4 space-y-3">
              {workers.map((worker) => (
                <div key={worker.id} className="admin-list-card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{worker.id}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Queue {worker.queueLength} 쨌 Active build {worker.activeBuildId || '-'} 쨌 Executor {worker.executorMode || 'mock'} 쨌 Scan {worker.scanMode || 'mock'}
                      </p>
                    </div>
                    <Pill variant="subtle">{worker.status}</Pill>
                  </div>
                </div>
              ))}
              {workers.length === 0 ? (
                <div className="empty-panel">
                  <p className="text-sm text-slate-600">{loading ? 'Loading workers...' : 'No workers are reporting yet.'}</p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="page-panel">
            <div className="flex items-center gap-2">
              <DatabaseZap className="h-5 w-5 text-slate-700" />
              <h3 className="text-lg font-bold">Allowed base images</h3>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <input
                value={createForm.imageRef}
                onChange={(event) => setCreateForm((current) => ({ ...current, imageRef: event.target.value }))}
                className="form-input-soft"
                placeholder="registry.internal.bank.co.kr/base/node:20-alpine"
              />
              <input
                value={createForm.description}
                onChange={(event) => setCreateForm((current) => ({ ...current, description: event.target.value }))}
                className="form-input-soft"
                placeholder="Description"
              />
              <OpalButton variant="primary" size="sm" onClick={() => void handleCreateBaseImage()} icon={<Plus className="h-4 w-4" />}>
                Add
              </OpalButton>
            </div>
            <div className="mt-4 space-y-3">
              {baseImages.map((baseImage) => (
                <div key={baseImage.id} className="admin-list-card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-sm font-semibold text-slate-900">{baseImage.imageRef}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {baseImage.description || 'No description'} 쨌 Added by {baseImage.addedBy} 쨌 {formatDate(baseImage.addedAt)}
                      </p>
                    </div>
                    <Pill variant="subtle">{baseImage.active ? 'active' : 'inactive'}</Pill>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="page-panel">
            <div className="flex items-center gap-2">
              <Boxes className="h-5 w-5 text-slate-700" />
              <h3 className="text-lg font-bold">Recent builds</h3>
            </div>
            <div className="mt-4 space-y-3">
              {builds.map((build) => (
                <div key={build.id} className="admin-list-card">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {build.imageName}:{build.tag}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {build.id} 쨌 Project {build.projectId} 쨌 {build.requesterName} 쨌 {formatDate(build.createdAt)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                        <span>Context {formatBytes(build.contextSize)}</span>
                        <span>Digest {build.imageDigest || '-'}</span>
                        <span>Policy {build.policyReport.summary.blockCount} block / {build.policyReport.summary.warnCount} warn</span>
                      </div>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getBuildTone(build.status)}`}>
                      {formatBuildStatus(build.status)}
                    </span>
                  </div>
                </div>
              ))}
              {builds.length === 0 ? (
                <div className="empty-panel">
                  <p className="text-sm text-slate-600">{loading ? 'Loading builds...' : 'No air-gapped builds have been recorded yet.'}</p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="page-panel">
            <div className="flex items-center gap-2">
              <ShieldEllipsis className="h-5 w-5 text-slate-700" />
              <h3 className="text-lg font-bold">Audit chain</h3>
            </div>
            <div className="mt-4 space-y-3">
              {auditLogs.map((log) => (
                <div key={log.id} className="admin-list-card">
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{log.eventType}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {log.actorName} ({log.actorRole}) 쨌 {formatDate(log.createdAt)}
                      </p>
                    </div>
                    <Pill variant="subtle">{log.targetType || 'system'}</Pill>
                  </div>
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
                    <p>{summarizeAuditDetail(log.detail)}</p>
                    <p className="mt-2 break-all text-slate-500">hash {log.logHash}</p>
                  </div>
                </div>
              ))}
              {auditLogs.length === 0 ? (
                <div className="empty-panel">
                  <p className="text-sm text-slate-600">{loading ? 'Loading audit logs...' : 'No audit records were returned.'}</p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="page-panel">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-slate-700" />
              <h3 className="text-lg font-bold">Operational notes</h3>
            </div>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p>Only images in the allowlist can be referenced by `FROM`.</p>
              <p>Blocked builds remain in the history so policy decisions are auditable.</p>
              <p>Worker state and audit chain are refreshed from the same `/api/v1` airgap endpoints used by the build UI.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
