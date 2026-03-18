import { useDeferredValue, useEffect, useState, type FormEvent } from 'react'
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Clock3,
  LogIn,
  LogOut,
  Mail,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  XCircle,
} from 'lucide-react'
import { useToast } from '../ToastProvider'
import {
  deleteSignupApplication,
  fetchSignupApplications,
  fetchSignupPlatformSummary,
  loginSignupAdmin,
  logoutSignupAdmin,
  reviewSignupApplication,
  submitSignupApplication,
  validateSignupAdminSession,
  type SignupAdminSession,
  type SignupApplication,
  type SignupApplicationInput,
  type SignupApplicationStatus,
  type SignupPlatformCounts,
  type SignupPlatformSummary,
} from '../../lib/signup-platform-api'

const ADMIN_STORAGE_KEY = 'signup-platform:admin-session'
const LEGACY_STORAGE_KEYS = [
  'admin_access_token',
  'admin_refresh_token',
  'admin_session_id',
  'admin_user',
]

const INITIAL_FORM: SignupApplicationInput = {
  name: '',
  email: '',
  phone: '',
  organization: '',
  department: '',
  positionTitle: '',
  message: '',
}

const EMPTY_COUNTS: SignupPlatformCounts = {
  total: 0,
  pending: 0,
  approved: 0,
  rejected: 0,
}

function getStatusMeta(status: SignupApplicationStatus) {
  if (status === 'approved') {
    return {
      label: '승인',
      cardClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      dotClass: 'bg-emerald-500',
    }
  }

  if (status === 'rejected') {
    return {
      label: '반려',
      cardClass: 'border-rose-200 bg-rose-50 text-rose-700',
      dotClass: 'bg-rose-500',
    }
  }

  return {
    label: '검토 대기',
    cardClass: 'border-amber-200 bg-amber-50 text-amber-700',
    dotClass: 'bg-amber-500',
  }
}

function formatDateLabel(value: string | null) {
  if (!value) {
    return '-'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function readStoredAdminSession() {
  if (typeof window === 'undefined') {
    return null
  }

  const raw = window.sessionStorage.getItem(ADMIN_STORAGE_KEY) ?? window.localStorage.getItem(ADMIN_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    const session = JSON.parse(raw) as SignupAdminSession
    window.localStorage.removeItem(ADMIN_STORAGE_KEY)
    window.sessionStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(session))
    return session
  } catch {
    window.sessionStorage.removeItem(ADMIN_STORAGE_KEY)
    window.localStorage.removeItem(ADMIN_STORAGE_KEY)
    return null
  }
}

function persistAdminSession(session: SignupAdminSession | null) {
  if (typeof window === 'undefined') {
    return
  }

  if (!session) {
    window.sessionStorage.removeItem(ADMIN_STORAGE_KEY)
    window.localStorage.removeItem(ADMIN_STORAGE_KEY)
    return
  }

  window.localStorage.removeItem(ADMIN_STORAGE_KEY)
  window.sessionStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(session))
}

function SignupMetricCard({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent: string
}) {
  return (
    <div className="rounded-[1.75rem] border border-white/60 bg-white/88 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className={`mb-4 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${accent}`}>{label}</div>
      <div className="text-3xl font-black tracking-[-0.04em] text-slate-950">{value.toLocaleString('ko-KR')}</div>
    </div>
  )
}

function ApplicationStatusBadge({ status }: { status: SignupApplicationStatus }) {
  const meta = getStatusMeta(status)

  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${meta.cardClass}`}>
      <span className={`h-2 w-2 rounded-full ${meta.dotClass}`} />
      {meta.label}
    </span>
  )
}

function AdminLoginDialog({
  isOpen,
  isSubmitting,
  form,
  onClose,
  onChange,
  onSubmit,
}: {
  isOpen: boolean
  isSubmitting: boolean
  form: { username: string; password: string }
  onClose: () => void
  onChange: (field: 'username' | 'password', value: string) => void
  onSubmit: () => void
}) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[2rem] border border-white/20 bg-slate-950 p-7 text-white shadow-[0_30px_120px_rgba(15,23,42,0.45)]">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200">
              <ShieldCheck className="h-4 w-4" />
              운영자 로그인
            </p>
            <h2 className="text-2xl font-black tracking-[-0.04em]">가입 신청 운영 센터</h2>
            <p className="mt-2 text-sm text-slate-300">접수 내역 조회, 승인, 반려, 삭제를 운영자 계정으로 처리합니다.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/15 bg-white/5 p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
            aria-label="로그인 창 닫기"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-200">아이디</span>
            <input
              type="text"
              value={form.username}
              onChange={(event) => onChange('username', event.target.value)}
              className="w-full rounded-2xl border border-white/15 bg-white/8 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-400 focus:border-cyan-300/70"
              placeholder="운영자 계정"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-200">비밀번호</span>
            <input
              type="password"
              value={form.password}
              onChange={(event) => onChange('password', event.target.value)}
              className="w-full rounded-2xl border border-white/15 bg-white/8 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-400 focus:border-cyan-300/70"
              placeholder="비밀번호"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !isSubmitting) {
                  onSubmit()
                }
              }}
            />
          </label>

          <button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <LogIn className="h-4 w-4" />
            {isSubmitting ? '로그인 중...' : '운영자 로그인'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SignupPlatformApp() {
  const toast = useToast()
  const [platform, setPlatform] = useState<SignupPlatformSummary | null>(null)
  const [isPlatformLoading, setIsPlatformLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [form, setForm] = useState<SignupApplicationInput>(INITIAL_FORM)
  const [isAdminDialogOpen, setIsAdminDialogOpen] = useState(false)
  const [adminSession, setAdminSession] = useState<SignupAdminSession | null>(null)
  const [isAdminBootstrapping, setIsAdminBootstrapping] = useState(true)
  const [adminLoginForm, setAdminLoginForm] = useState({ username: '', password: '' })
  const [isAdminLoginSubmitting, setIsAdminLoginSubmitting] = useState(false)
  const [applications, setApplications] = useState<SignupApplication[]>([])
  const [adminCounts, setAdminCounts] = useState<SignupPlatformCounts>(EMPTY_COUNTS)
  const [isApplicationsLoading, setIsApplicationsLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | SignupApplicationStatus>('all')
  const [search, setSearch] = useState('')
  const [selectedApplicationId, setSelectedApplicationId] = useState<number | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [processingAction, setProcessingAction] = useState<'approve' | 'reject' | 'pending' | 'delete' | null>(null)
  const deferredSearch = useDeferredValue(search.trim())

  const selectedApplication =
    applications.find((application) => application.id === selectedApplicationId) ?? applications[0] ?? null

  useEffect(() => {
    document.title = 'JB Hub 가입 플랫폼'
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    for (const key of LEGACY_STORAGE_KEYS) {
      window.localStorage.removeItem(key)
    }

    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith('jb-hub:')) {
        window.localStorage.removeItem(key)
      }
    }
  }, [])

  async function loadPlatformSummary() {
    setIsPlatformLoading(true)

    try {
      const summary = await fetchSignupPlatformSummary()
      setPlatform(summary)
      setAdminCounts(summary.counts)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '가입 플랫폼 정보를 불러오지 못했습니다.')
    } finally {
      setIsPlatformLoading(false)
    }
  }

  async function loadAdminApplications(session: SignupAdminSession, nextStatus = statusFilter, nextSearch = deferredSearch) {
    setIsApplicationsLoading(true)

    try {
      const payload = await fetchSignupApplications(session, {
        status: nextStatus,
        search: nextSearch,
      })
      setApplications(payload.applications)
      setAdminCounts(payload.counts)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '가입 신청 목록을 불러오지 못했습니다.')
    } finally {
      setIsApplicationsLoading(false)
    }
  }

  useEffect(() => {
    void loadPlatformSummary()
  }, [])

  useEffect(() => {
    let isActive = true

    async function bootstrapAdminSession() {
      const stored = readStoredAdminSession()
      if (!stored) {
        if (isActive) {
          setIsAdminBootstrapping(false)
        }
        return
      }

      try {
        await validateSignupAdminSession(stored)
        if (!isActive) {
          return
        }
        setAdminSession(stored)
      } catch {
        persistAdminSession(null)
      } finally {
        if (isActive) {
          setIsAdminBootstrapping(false)
        }
      }
    }

    void bootstrapAdminSession()

    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    if (!adminSession) {
      setApplications([])
      return
    }

    void loadAdminApplications(adminSession)
  }, [adminSession, statusFilter, deferredSearch])

  useEffect(() => {
    if (!selectedApplication) {
      setSelectedApplicationId(null)
      setReviewNote('')
      return
    }

    setSelectedApplicationId(selectedApplication.id)
    setReviewNote(selectedApplication.reviewNote ?? '')
  }, [selectedApplication?.id])

  async function handleSubmitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)

    try {
      const payload = await submitSignupApplication(form)
      setForm(INITIAL_FORM)
      setAdminCounts(payload.counts)
      toast.success('가입 신청이 접수되었습니다. 검토 후 승인 상태를 안내합니다.')
      await loadPlatformSummary()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '가입 신청을 접수하지 못했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleAdminLogin() {
    if (!adminLoginForm.username.trim() || !adminLoginForm.password.trim()) {
      toast.warning('운영자 아이디와 비밀번호를 입력해 주세요.')
      return
    }

    setIsAdminLoginSubmitting(true)

    try {
      const session = await loginSignupAdmin(adminLoginForm.username.trim(), adminLoginForm.password)
      persistAdminSession(session)
      setAdminSession(session)
      setIsAdminDialogOpen(false)
      toast.success('운영자 로그인에 성공했습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '운영자 로그인에 실패했습니다.')
    } finally {
      setIsAdminLoginSubmitting(false)
    }
  }

  async function handleAdminLogout() {
    if (!adminSession) {
      return
    }

    await logoutSignupAdmin(adminSession)
    persistAdminSession(null)
    setAdminSession(null)
    setApplications([])
    toast.info('운영자 세션을 종료했습니다.')
  }

  async function handleReview(status: SignupApplicationStatus) {
    if (!adminSession || !selectedApplication) {
      return
    }

    setProcessingAction(status === 'approved' ? 'approve' : status === 'rejected' ? 'reject' : 'pending')

    try {
      const payload = await reviewSignupApplication(adminSession, selectedApplication.id, {
        status,
        reviewNote,
      })

      setAdminCounts(payload.counts)
      toast.success(`가입 신청을 ${getStatusMeta(status).label} 상태로 변경했습니다.`)
      await Promise.all([loadAdminApplications(adminSession), loadPlatformSummary()])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '가입 신청 상태를 변경하지 못했습니다.')
    } finally {
      setProcessingAction(null)
    }
  }

  async function handleDeleteApplication() {
    if (!adminSession || !selectedApplication) {
      return
    }

    setProcessingAction('delete')

    try {
      const payload = await deleteSignupApplication(adminSession, selectedApplication.id)
      setAdminCounts(payload.counts)
      toast.success('가입 신청을 삭제했습니다.')
      await Promise.all([loadAdminApplications(adminSession), loadPlatformSummary()])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '가입 신청을 삭제하지 못했습니다.')
    } finally {
      setProcessingAction(null)
    }
  }

  function renderPublicPanels() {
    return (
      <section className="grid gap-6 xl:grid-cols-[0.98fr_1.02fr]">
        <div className="rounded-[2.25rem] border border-white/70 bg-white/92 p-6 shadow-[0_22px_60px_rgba(15,23,42,0.08)] backdrop-blur sm:p-7">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">가입 접수</p>
              <h3 className="mt-2 text-3xl font-black tracking-[-0.04em] text-slate-950">가입 신청서</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">운영자가 검토할 기본 정보를 작성해 주세요. 동일 이메일의 중복 승인 신청은 차단됩니다.</p>
            </div>
            <div className="hidden rounded-[1.4rem] bg-slate-100 px-4 py-3 text-right sm:block">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">운영 기준</p>
              <p className="mt-1 text-sm font-semibold text-slate-700">이름 2자 이상 / 조직명 2자 이상 / 이메일 형식 필수</p>
            </div>
          </div>

          <form className="grid gap-4" onSubmit={handleSubmitApplication}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">담당자 이름</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-950 focus:bg-white"
                  placeholder="홍길동"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">이메일</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-950 focus:bg-white"
                  placeholder="hong@example.com"
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">연락처</span>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-950 focus:bg-white"
                  placeholder="010-0000-0000"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">소속 조직</span>
                <input
                  type="text"
                  value={form.organization}
                  onChange={(event) => setForm((current) => ({ ...current, organization: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-950 focus:bg-white"
                  placeholder="제이비 디지털"
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">부서</span>
                <input
                  type="text"
                  value={form.department}
                  onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-950 focus:bg-white"
                  placeholder="IT 운영"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">직책</span>
                <input
                  type="text"
                  value={form.positionTitle}
                  onChange={(event) => setForm((current) => ({ ...current, positionTitle: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-950 focus:bg-white"
                  placeholder="프로덕트 매니저"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">도입 메시지</span>
              <textarea
                value={form.message}
                onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
                rows={5}
                className="w-full rounded-[1.6rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-950 focus:bg-white"
                placeholder="가입 목적, 기대 효과, 필요한 운영 조건을 적어 주세요."
              />
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-[1.6rem] bg-slate-950 px-5 py-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? '접수 중...' : '가입 신청 제출'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </div>

        <div className="rounded-[2.25rem] border border-white/70 bg-white/92 p-6 shadow-[0_22px_60px_rgba(15,23,42,0.08)] backdrop-blur sm:p-7">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">승인 이력</p>
              <h3 className="mt-2 text-3xl font-black tracking-[-0.04em] text-slate-950">최근 승인된 가입</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">운영자가 승인한 최근 신청을 공개 요약으로 표시합니다.</p>
            </div>
            <div className="rounded-full bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700">공개 가능 상태만 노출</div>
          </div>

          <div className="space-y-4">
            {isPlatformLoading ? (
              <div className="rounded-[1.7rem] border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
                승인 이력을 불러오는 중입니다.
              </div>
            ) : platform && platform.approvedApplications.length > 0 ? (
              platform.approvedApplications.map((application) => (
                <article
                  key={application.id}
                  className="rounded-[1.7rem] border border-slate-200 bg-slate-50/80 p-5 transition hover:border-slate-300 hover:bg-white"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-lg font-black tracking-[-0.03em] text-slate-950">{application.organization}</h4>
                      <p className="mt-1 text-sm text-slate-600">
                        {application.name}
                        {application.positionTitle ? ` · ${application.positionTitle}` : ''}
                        {application.department ? ` · ${application.department}` : ''}
                      </p>
                    </div>
                    <ApplicationStatusBadge status={application.status} />
                  </div>
                  <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                    <div className="inline-flex items-center gap-2">
                      <Mail className="h-4 w-4 text-slate-400" />
                      {application.email}
                    </div>
                    <div className="inline-flex items-center gap-2">
                      <Clock3 className="h-4 w-4 text-slate-400" />
                      {formatDateLabel(application.reviewedAt ?? application.createdAt)}
                    </div>
                  </div>
                  {application.message ? (
                    <p className="mt-4 rounded-[1.4rem] bg-white px-4 py-3 text-sm leading-6 text-slate-700">{application.message}</p>
                  ) : null}
                </article>
              ))
            ) : (
              <div className="rounded-[1.7rem] border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
                아직 공개할 승인 이력이 없습니다.
              </div>
            )}
          </div>
        </div>
      </section>
    )
  }

  function renderAdminDashboard() {
    if (!adminSession) {
      return null
    }

    return (
      <div className="mt-6 grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
        <div className="rounded-[2rem] border border-white/10 bg-white/6 p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-900/70 py-3 pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-slate-400 focus:border-cyan-300/70"
                  placeholder="이름, 이메일, 조직명, 부서 검색"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as 'all' | SignupApplicationStatus)}
                className="rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/70"
              >
                <option value="all">전체 상태</option>
                <option value="pending">검토 대기</option>
                <option value="approved">승인</option>
                <option value="rejected">반려</option>
              </select>
            </div>

            <div className="max-h-[620px] space-y-3 overflow-y-auto pr-1">
              {isApplicationsLoading ? (
                <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-slate-900/40 px-4 py-10 text-center text-sm text-slate-300">
                  가입 신청 목록을 불러오는 중입니다.
                </div>
              ) : applications.length > 0 ? (
                applications.map((application) => (
                  <button
                    key={application.id}
                    type="button"
                    onClick={() => setSelectedApplicationId(application.id)}
                    className={`w-full rounded-[1.6rem] border px-4 py-4 text-left transition ${
                      selectedApplication?.id === application.id
                        ? 'border-cyan-300/70 bg-cyan-300/12'
                        : 'border-white/10 bg-slate-900/38 hover:border-white/20 hover:bg-slate-900/54'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-white">{application.organization}</p>
                        <p className="mt-1 text-xs text-slate-300">
                          {application.name} · {application.email}
                        </p>
                      </div>
                      <ApplicationStatusBadge status={application.status} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="h-3.5 w-3.5" />
                        {application.department || '부서 미입력'}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="h-3.5 w-3.5" />
                        {formatDateLabel(application.createdAt)}
                      </span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-slate-900/40 px-4 py-10 text-center text-sm text-slate-300">
                  조건에 맞는 가입 신청이 없습니다.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white/8 p-5">
          {selectedApplication ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100">신청 상세</p>
                  <h4 className="mt-2 text-3xl font-black tracking-[-0.04em] text-white">{selectedApplication.organization}</h4>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    {selectedApplication.name}
                    {selectedApplication.positionTitle ? ` · ${selectedApplication.positionTitle}` : ''}
                    {selectedApplication.department ? ` · ${selectedApplication.department}` : ''}
                  </p>
                </div>
                <ApplicationStatusBadge status={selectedApplication.status} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[1.5rem] bg-slate-900/70 p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">연락 정보</p>
                  <div className="space-y-2 text-sm text-slate-200">
                    <p className="inline-flex items-center gap-2">
                      <UserRound className="h-4 w-4 text-slate-400" />
                      {selectedApplication.name}
                    </p>
                    <p className="inline-flex items-center gap-2">
                      <Mail className="h-4 w-4 text-slate-400" />
                      {selectedApplication.email}
                    </p>
                    <p className="inline-flex items-center gap-2">
                      <Clock3 className="h-4 w-4 text-slate-400" />
                      {formatDateLabel(selectedApplication.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="rounded-[1.5rem] bg-slate-900/70 p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">조직 정보</p>
                  <div className="space-y-2 text-sm text-slate-200">
                    <p className="inline-flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-slate-400" />
                      {selectedApplication.organization}
                    </p>
                    <p>{selectedApplication.department || '부서 미입력'}</p>
                    <p>{selectedApplication.positionTitle || '직책 미입력'}</p>
                    <p>{selectedApplication.phone || '연락처 미입력'}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.6rem] bg-slate-900/70 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">도입 메시지</p>
                <p className="text-sm leading-7 text-slate-200">{selectedApplication.message || '작성된 메시지가 없습니다.'}</p>
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-200">검토 메모</span>
                <textarea
                  value={reviewNote}
                  onChange={(event) => setReviewNote(event.target.value)}
                  rows={5}
                  className="w-full rounded-[1.6rem] border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-400 focus:border-cyan-300/70"
                  placeholder="운영자가 남길 검토 메모를 입력합니다."
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <button
                  type="button"
                  disabled={processingAction !== null}
                  onClick={() => void handleReview('approved')}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {processingAction === 'approve' ? '처리 중...' : '승인'}
                </button>
                <button
                  type="button"
                  disabled={processingAction !== null}
                  onClick={() => void handleReview('rejected')}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-rose-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <XCircle className="h-4 w-4" />
                  {processingAction === 'reject' ? '처리 중...' : '반려'}
                </button>
                <button
                  type="button"
                  disabled={processingAction !== null}
                  onClick={() => void handleReview('pending')}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-300 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Clock3 className="h-4 w-4" />
                  {processingAction === 'pending' ? '처리 중...' : '대기로 되돌리기'}
                </button>
                <button
                  type="button"
                  disabled={processingAction !== null}
                  onClick={() => void handleDeleteApplication()}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/12 bg-slate-900/80 px-4 py-3 text-sm font-bold text-white transition hover:border-rose-300/60 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" />
                  {processingAction === 'delete' ? '삭제 중...' : '삭제'}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-[1.7rem] border border-dashed border-white/10 bg-slate-900/40 px-4 py-16 text-center text-sm text-slate-300">
              왼쪽 목록에서 가입 신청을 선택하면 상세 정보를 확인할 수 있습니다.
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.16),transparent_28%),radial-gradient(circle_at_top_right,rgba(251,191,36,0.14),transparent_24%),linear-gradient(180deg,#f8fbff_0%,#eff4fb_42%,#f4f7fb_100%)] text-slate-900">
      <AdminLoginDialog
        isOpen={isAdminDialogOpen}
        isSubmitting={isAdminLoginSubmitting}
        form={adminLoginForm}
        onClose={() => setIsAdminDialogOpen(false)}
        onChange={(field, value) => {
          setAdminLoginForm((current) => ({ ...current, [field]: value }))
        }}
        onSubmit={handleAdminLogin}
      />

      <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-[2rem] border border-white/70 bg-white/75 px-5 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-slate-950 px-3 py-2 text-sm font-black tracking-[0.18em] text-white">JB</div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">가입 플랫폼</p>
                <h1 className="text-xl font-black tracking-[-0.04em] text-slate-950 sm:text-2xl">JB Hub 가입 플랫폼</h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {adminSession ? (
                <>
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
                    <BadgeCheck className="h-4 w-4" />
                    운영자 세션: {adminSession.username}
                  </span>
                  <button
                    type="button"
                    onClick={handleAdminLogout}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-900 hover:text-slate-950"
                  >
                    <LogOut className="h-4 w-4" />
                    로그아웃
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAdminDialogOpen(true)}
                  disabled={isAdminBootstrapping}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <LogIn className="h-4 w-4" />
                  {isAdminBootstrapping ? '세션 확인 중...' : '운영자 로그인'}
                </button>
              )}
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="relative overflow-hidden rounded-[2.4rem] border border-slate-200/80 bg-slate-950 px-6 py-7 text-white shadow-[0_30px_90px_rgba(15,23,42,0.2)] sm:px-8 sm:py-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.25),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(251,191,36,0.18),transparent_28%)]" />
            <div className="relative">
              <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-cyan-100">
                <Sparkles className="h-4 w-4" />
                조직 가입 심사 워크플로우
              </p>
              <h2 className="max-w-3xl text-4xl font-black tracking-[-0.05em] text-white sm:text-5xl">
                프로젝트 허브를 걷어내고,
                <br />
                가입 접수와 심사에만 집중한 화면으로 전환했습니다.
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-200 sm:text-lg">
                조직명, 부서, 담당자 정보를 한 번에 접수하고 운영자가 바로 승인 상태를 관리하는 가입 플랫폼입니다.
                기존 프로젝트 데이터와 파일 저장소는 초기화 대상이며, 현재 화면은 가입 신청 흐름만 남깁니다.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <div className="rounded-[1.5rem] border border-white/10 bg-white/8 p-4">
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100">
                    <ShieldCheck className="h-4 w-4" />
                    운영 방식
                  </p>
                  <p className="text-sm leading-6 text-slate-100">운영자가 접수 내역을 검토하고 승인, 반려, 재검토로 상태를 관리합니다.</p>
                </div>
                <div className="rounded-[1.5rem] border border-white/10 bg-white/8 p-4">
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100">
                    <Building2 className="h-4 w-4" />
                    제출 정보
                  </p>
                  <p className="text-sm leading-6 text-slate-100">조직명, 담당자, 부서, 연락처, 도입 메시지까지 같은 양식으로 정리합니다.</p>
                </div>
                <div className="rounded-[1.5rem] border border-white/10 bg-white/8 p-4">
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100">
                    <Clock3 className="h-4 w-4" />
                    처리 흐름
                  </p>
                  <p className="text-sm leading-6 text-slate-100">대기, 승인, 반려 상태를 운영자 대시보드에서 즉시 조정할 수 있습니다.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SignupMetricCard label="전체 신청" value={platform?.counts.total ?? adminCounts.total} accent="bg-slate-950 text-white" />
            <SignupMetricCard label="검토 대기" value={platform?.counts.pending ?? adminCounts.pending} accent="bg-amber-100 text-amber-700" />
            <SignupMetricCard label="승인 완료" value={platform?.counts.approved ?? adminCounts.approved} accent="bg-emerald-100 text-emerald-700" />
            <SignupMetricCard label="반려" value={platform?.counts.rejected ?? adminCounts.rejected} accent="bg-rose-100 text-rose-700" />

            <div className="rounded-[2rem] border border-white/65 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur sm:col-span-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">공개 현황</p>
                  <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950">
                    {isPlatformLoading ? '가입 현황을 불러오는 중...' : platform?.headline ?? '가입 플랫폼'}
                  </h3>
                </div>
                <div className="rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-600">
                  최근 승인 {platform?.approvedApplications.length ?? 0}건
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                모든 기존 프로젝트 데이터는 초기화 대상이며, 현재는 가입 신청과 승인 이력 중심으로 운영됩니다.
              </p>
            </div>
          </div>
        </section>

        {renderPublicPanels()}

        <section className="rounded-[2.4rem] border border-slate-200/80 bg-slate-950 px-6 py-6 text-white shadow-[0_30px_90px_rgba(15,23,42,0.2)] sm:px-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100">운영 검토 콘솔</p>
              <h3 className="mt-2 text-3xl font-black tracking-[-0.04em] text-white">운영자 심사 대시보드</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                {adminSession
                  ? '현재 운영자 세션으로 모든 가입 신청을 검색, 승인, 반려, 삭제할 수 있습니다.'
                  : '운영자 로그인 후 접수 목록과 심사 도구가 활성화됩니다.'}
              </p>
            </div>
            {!adminSession ? (
              <button
                type="button"
                onClick={() => setIsAdminDialogOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-cyan-300 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"
              >
                <ShieldCheck className="h-4 w-4" />
                운영자 로그인 열기
              </button>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                <SignupMetricCard label="검토 대기" value={adminCounts.pending} accent="bg-amber-100 text-amber-700" />
                <SignupMetricCard label="승인 완료" value={adminCounts.approved} accent="bg-emerald-100 text-emerald-700" />
                <SignupMetricCard label="반려" value={adminCounts.rejected} accent="bg-rose-100 text-rose-700" />
              </div>
            )}
          </div>

          {renderAdminDashboard()}
        </section>
      </div>
    </div>
  )
}
