import { FormEvent, useMemo, useState } from 'react'
import { ArrowRight, Eye, EyeOff, Lock, LogIn, ShieldCheck, Sparkles, User } from 'lucide-react'
import type { HubDemoAccount } from '../lib/hub-auth'
import { OpalButton } from './opal/OpalButton'
import { OpalInput } from './opal/OpalInput'
import { Pill } from './common'

export interface AuthLoginResult {
  success: boolean
  error?: string
}

interface AuthLoginPageProps {
  onSubmitLogin: (username: string, password: string) => Promise<AuthLoginResult> | AuthLoginResult
  demoAccounts?: HubDemoAccount[]
  onOpenAdminPage?: () => void
}

function getRoleLabel(role: HubDemoAccount['role']) {
  return role === 'admin' ? '관리자' : '구성원'
}

export function AuthLoginPage({
  onSubmitLogin,
  demoAccounts = [],
  onOpenAdminPage,
}: AuthLoginPageProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)

  const selectedAccount = useMemo(
    () => demoAccounts.find((account) => account.id === selectedAccountId) ?? null,
    [demoAccounts, selectedAccountId],
  )

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
      setSelectedAccountId(null)
    } catch {
      setError('로그인 처리 중 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSelectAccount = (account: HubDemoAccount) => {
    setSelectedAccountId(account.id)
    setUsername(account.username)
    setPassword(account.password)
    setError(null)
  }

  return (
    <div className="mx-auto w-full max-w-5xl pb-10 pt-5 sm:pt-8 lg:pt-10">
      <header className="page-header-card fade-up">
        <div className="page-header-grid">
          <div className="page-header-stack">
          <div className="space-y-3">
            <Pill variant="subtle">JB-HUB 로그인</Pill>
            <h1 className="text-2xl font-bold leading-[1.12] tracking-tight text-slate-950 sm:text-3xl">
              로그인 후 허브 전체 기능을 이용할 수 있습니다
              <span className="text-gradient-brand block">프로젝트 탐색부터 운영 콘솔 진입 전 단계까지 한 번에 준비됩니다</span>
            </h1>
            <p className="max-w-2xl text-sm text-slate-600 sm:text-base">
              지금은 데모 계정 기반으로 로그인 흐름을 확인할 수 있게 구성했습니다. 아래 계정을 선택하면 아이디와 비밀번호가 자동으로
              채워지고, 역할에 맞는 허브 화면으로 바로 들어갑니다.
            </p>
          </div>
          <div className="pill-row">
            <Pill variant="subtle">데모 계정 제공</Pill>
            <Pill variant="subtle">역할 기반 진입</Pill>
          </div>
        </div>
        </div>
      </header>

      <section className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="page-panel">
          {demoAccounts.length > 0 ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">빠른 로그인</h2>
                <p className="mt-1 text-sm text-slate-600">테스트할 계정을 선택하면 로그인 정보가 자동으로 입력됩니다.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {demoAccounts.map((account) => {
                  const isSelected = account.id === selectedAccountId

                  return (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => handleSelectAccount(account)}
                      className={`rounded-2xl border px-4 py-4 text-left transition ${
                        isSelected
                          ? 'border-[#315779]/30 bg-[#eef4fa] text-slate-900'
                          : 'border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{account.title}</p>
                          <p className={`mt-1 text-xs ${isSelected ? 'text-slate-600' : 'text-slate-500'}`}>
                            {account.name} · {account.department}
                          </p>
                        </div>
                        <Pill variant={account.role === 'admin' ? 'solid' : 'subtle'}>{getRoleLabel(account.role)}</Pill>
                      </div>
                      <p className={`mt-3 text-sm leading-6 ${isSelected ? 'text-slate-700' : 'text-slate-600'}`}>
                        {account.description}
                      </p>
                      <div className={`mt-4 text-xs font-medium ${isSelected ? 'text-slate-600' : 'text-slate-500'}`}>
                        아이디 {account.username} · 비밀번호 {account.password}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div className={`${demoAccounts.length > 0 ? 'mt-6 border-t border-slate-200 pt-5' : ''} mb-5`}>
            <h2 className="text-xl font-bold text-slate-900">계정 로그인</h2>
            <p className="mt-1 text-sm text-slate-600">선택한 데모 계정 또는 직접 입력한 계정으로 로그인해 주세요.</p>
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
              <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
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
              {onOpenAdminPage ? (
                <OpalButton
                  variant="secondary"
                  size="md"
                  onClick={onOpenAdminPage}
                  className="w-full sm:w-auto"
                  icon={<ArrowRight className="h-4 w-4" />}
                >
                  관리자 콘솔
                </OpalButton>
              ) : null}
            </div>
          </form>
        </div>

        <aside className="page-panel">
          <div className="space-y-4">
            <h3 className="text-sm font-bold tracking-[0.04em] text-slate-700">로그인 안내</h3>

            {selectedAccount ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-slate-600">선택된 계정</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{selectedAccount.name}</p>
                  </div>
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {getRoleLabel(selectedAccount.role)}
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">{selectedAccount.description}</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-4 text-sm text-slate-600">
                아직 선택된 계정이 없습니다. 위의 빠른 로그인 카드에서 하나를 선택하면 더 편하게 테스트할 수 있습니다.
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4 text-xs text-slate-700">
              <p className="font-semibold text-slate-800">테스트 포인트</p>
              <div className="mt-2 space-y-2 leading-5">
                <p>구성원 계정은 개인 작업 화면과 프로젝트 탐색 흐름을 확인하기 좋습니다.</p>
                <p>관리자 계정은 허브 로그인 후 관리자 콘솔 버튼이 함께 노출됩니다.</p>
                <p>기존 빠른 테스트용 계정 `1 / 1`도 계속 사용할 수 있게 유지했습니다.</p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4 text-xs leading-5 text-slate-600">
              로그인 후에는 역할에 맞는 화면 상태가 즉시 반영됩니다. 관리자 계정으로 들어오면 허브 안에서도 관리자 콘솔 진입 버튼이
              보이고, 로그아웃하면 다시 로그인 화면으로 돌아옵니다.
            </div>
          </div>
        </aside>
      </section>
    </div>
  )
}
