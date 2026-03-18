import { FormEvent, useState } from 'react'
import { Eye, EyeOff, Lock, LogIn, ShieldCheck, Sparkles, User } from 'lucide-react'
import { OpalButton } from './opal/OpalButton'
import { OpalInput } from './opal/OpalInput'
import { Pill } from './common'

export interface AuthLoginResult {
  success: boolean
  error?: string
}

interface AuthLoginPageProps {
  onSubmitLogin: (username: string, password: string) => Promise<AuthLoginResult> | AuthLoginResult
  currentUsername?: string | null
  currentRole?: 'member' | 'admin' | null
  allowDemoAdminLogin?: boolean
}

export function AuthLoginPage({
  onSubmitLogin,
  currentUsername = null,
  currentRole = null,
  allowDemoAdminLogin = false,
}: AuthLoginPageProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    const normalizedUsername = username.trim()
    const normalizedPassword = password.trim()

    if (!normalizedUsername || !normalizedPassword) {
      setError('아이디와 비밀번호를 모두 입력해 주세요.')
      setIsSubmitting(false)
      return
    }

    try {
      const result = await Promise.resolve(onSubmitLogin(normalizedUsername, normalizedPassword))
      if (!result.success) {
        setError(result.error ?? '로그인에 실패했습니다.')
        return
      }

      setError(null)
      setUsername('')
      setPassword('')
    } catch {
      setError('로그인 처리 중 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUseDemoAccount = () => {
    setUsername('1')
    setPassword('1')
    setError(null)
  }

  return (
    <div className="mx-auto w-full max-w-6xl pb-14 pt-6 sm:pt-10 lg:pt-14">
      <header className="hero-panel fade-up">
        <div className="floating-orb-hero-right" />
        <div className="floating-orb-hero-left" />
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <Pill>JB-HUB 접근</Pill>
            <h1 className="text-2xl font-bold leading-[1.12] tracking-tight text-white sm:text-3xl">
              로그인해야 서비스를 이용할 수 있습니다
              <span className="text-gradient-brand block">프로젝트 탐색, 커뮤니티, 관리자 기능까지 보호합니다</span>
            </h1>
            <p className="max-w-2xl text-sm text-slate-100/95 sm:text-base">
              계정 인증 이후에만 화면 접근이 가능합니다. 권한에 따라 일반 사용자 화면 또는 관리자 화면으로 진입합니다.
            </p>
          </div>
          <div className="pill-row">
            <Pill>보안 로그인</Pill>
            <Pill>역할 기반 접근</Pill>
          </div>
        </div>
      </header>

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="surface-panel rounded-3xl p-5 sm:p-6">
          <div className="mb-5">
            <h2 className="text-xl font-bold text-slate-900">계정 로그인</h2>
            <p className="mt-1 text-sm text-slate-600">등록된 아이디와 비밀번호로 로그인해 주세요.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="auth-username" className="field-label">
                아이디
              </label>
              <OpalInput
                id="auth-username"
                value={username}
                onChange={setUsername}
                placeholder="아이디 입력"
                icon={<User className="h-4 w-4" />}
                autoComplete="username"
                ariaLabel="아이디 입력"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="auth-password" className="field-label">
                비밀번호
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="비밀번호 입력"
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-[#cbd8e3] bg-white/94 py-3 pl-11 pr-12 text-sm font-medium text-slate-900 placeholder:text-slate-500 shadow-[0_3px_8px_rgba(17,42,63,0.06)] outline-none transition-all duration-300 focus:border-[#33597f] focus:bg-white focus:ring-2 focus:ring-[#d9e4ef]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                  aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
            ) : null}

            <div className="action-row pt-1">
              <OpalButton
                type="submit"
                variant="primary"
                size="md"
                disabled={isSubmitting}
                icon={isSubmitting ? <Sparkles className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                className="w-full sm:w-auto sm:min-w-[180px]"
              >
                {isSubmitting ? '로그인 중...' : '로그인'}
              </OpalButton>
              {allowDemoAdminLogin ? (
                <button
                  type="button"
                  onClick={handleUseDemoAccount}
                  className="glass-inline-button w-full justify-center sm:w-auto"
                >
                  데모 계정 입력 (1 / 1)
                </button>
              ) : null}
            </div>
          </form>
        </div>

        <aside className="surface-panel rounded-3xl p-5 sm:p-6">
          <div className="space-y-4">
            <h3 className="text-sm font-bold tracking-[0.04em] text-slate-700">접속 상태</h3>

            {currentUsername ? (
              <div className="rounded-2xl border border-slate-200 bg-white/90 p-4">
                <p className="text-sm text-slate-600">현재 세션 사용자</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{currentUsername}</p>
                <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {currentRole === 'admin' ? '관리자' : '일반 사용자'}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-4 text-sm text-slate-600">
                로그인 전 상태입니다.
              </div>
            )}

            {allowDemoAdminLogin ? (
              <div className="rounded-2xl border border-[#c8d8e8] bg-[#f2f7fc] p-4 text-xs text-slate-700">
                <p className="font-semibold text-slate-800">개발 모드 안내</p>
                <p className="mt-1">데모 관리자 계정: 1 / 1</p>
              </div>
            ) : null}

            <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 text-xs leading-5 text-slate-600">
              인증이 끝나면 권한에 맞는 화면으로 이동합니다. 관리자 기능은 관리자 계정으로 로그인해야 사용할 수 있습니다.
            </div>
          </div>
        </aside>
      </section>
    </div>
  )
}
