import { useMemo, useState, type ReactNode } from 'react'
import { Bell, Palette, Save, Settings, Shield } from 'lucide-react'
import { MetricCard, PageHeader, PageShell, Pill } from '../common'

export type Theme = 'light' | 'dark' | 'auto'
export type Language = 'ko' | 'en'
export type Density = 'comfortable' | 'compact'

interface UserSettingsState {
  theme: Theme
  language: Language
  density: Density
  notifications: {
    email: boolean
    push: boolean
    projectUpdates: boolean
    newComments: boolean
    trending: boolean
  }
  privacy: {
    profilePublic: boolean
    showActivity: boolean
    showBookmarks: boolean
  }
}

interface UserSettingsProps {
  onSave?: (settings: UserSettingsState) => void
  onClose?: () => void
}

type SettingsTab = 'appearance' | 'notifications' | 'privacy' | 'account'

const STORAGE_KEY = 'jb-hub:user-settings'

const DEFAULT_SETTINGS: UserSettingsState = {
  theme: 'light',
  language: 'ko',
  density: 'comfortable',
  notifications: {
    email: true,
    push: true,
    projectUpdates: true,
    newComments: true,
    trending: false,
  },
  privacy: {
    profilePublic: false,
    showActivity: true,
    showBookmarks: true,
  },
}

const TAB_OPTIONS: Array<{ id: SettingsTab; label: string; icon: typeof Palette }> = [
  { id: 'appearance', label: '화면', icon: Palette },
  { id: 'notifications', label: '알림', icon: Bell },
  { id: 'privacy', label: '개인정보', icon: Shield },
  { id: 'account', label: '계정', icon: Settings },
]

const THEME_LABELS: Record<Theme, string> = {
  light: '라이트',
  dark: '다크',
  auto: '시스템',
}

const LANGUAGE_LABELS: Record<Language, string> = {
  ko: '한국어',
  en: 'English',
}

const DENSITY_LABELS: Record<Density, string> = {
  comfortable: '여유롭게',
  compact: '컴팩트',
}

function mergeSettings(candidate: Partial<UserSettingsState> | null | undefined): UserSettingsState {
  const next = candidate ?? {}

  return {
    ...DEFAULT_SETTINGS,
    ...next,
    notifications: {
      ...DEFAULT_SETTINGS.notifications,
      ...next.notifications,
    },
    privacy: {
      ...DEFAULT_SETTINGS.privacy,
      ...next.privacy,
    },
  }
}

function getTabLabel(tab: SettingsTab) {
  return TAB_OPTIONS.find((option) => option.id === tab)?.label ?? tab
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return
  }

  if (theme === 'dark') {
    document.documentElement.classList.add('dark')
    return
  }

  if (theme === 'light') {
    document.documentElement.classList.remove('dark')
    return
  }

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.classList.toggle('dark', prefersDark)
}

function OptionCard({
  active,
  title,
  description,
  onClick,
  preview,
}: {
  active: boolean
  title: string
  description: string
  onClick: () => void
  preview?: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[24px] border p-4 text-left transition ${
        active ? 'border-[#315779]/30 bg-[#eef4fa]' : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      {preview ? <div className="mb-3">{preview}</div> : null}
      <p className="font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </button>
  )
}

function ToggleRow({
  title,
  description,
  checked,
  onToggle,
}: {
  title: string
  description: string
  checked: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
      <div>
        <p className="font-medium text-slate-900">{title}</p>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={`relative h-6 w-12 rounded-full transition-colors ${
          checked ? 'bg-[#315779]' : 'bg-slate-300'
        }`}
        aria-pressed={checked}
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-7' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}

export function loadUserSettings(): UserSettingsState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return mergeSettings(stored ? (JSON.parse(stored) as Partial<UserSettingsState>) : undefined)
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveUserSettings(settings: UserSettingsState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    applyTheme(settings.theme)
  } catch (error) {
    console.error('Failed to save settings:', error)
  }
}

export function UserSettings({ onSave, onClose }: UserSettingsProps) {
  const [settings, setSettings] = useState<UserSettingsState>(() => loadUserSettings())
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance')
  const [saved, setSaved] = useState(false)

  const enabledNotificationCount = useMemo(
    () => Object.values(settings.notifications).filter(Boolean).length,
    [settings.notifications],
  )

  const updateTopLevel = <K extends keyof Pick<UserSettingsState, 'theme' | 'language' | 'density'>>(
    key: K,
    value: UserSettingsState[K],
  ) => {
    setSettings((previous) => ({
      ...previous,
      [key]: value,
    }))
  }

  const updateNotification = (key: keyof UserSettingsState['notifications'], value: boolean) => {
    setSettings((previous) => ({
      ...previous,
      notifications: {
        ...previous.notifications,
        [key]: value,
      },
    }))
  }

  const updatePrivacy = (key: keyof UserSettingsState['privacy'], value: boolean) => {
    setSettings((previous) => ({
      ...previous,
      privacy: {
        ...previous.privacy,
        [key]: value,
      },
    }))
  }

  const handleSave = () => {
    saveUserSettings(settings)
    setSaved(true)
    onSave?.(settings)
    window.setTimeout(() => setSaved(false), 2000)
  }

  const summaryMetrics = [
    { key: 'theme', label: '현재 테마', value: THEME_LABELS[settings.theme] },
    { key: 'language', label: '언어', value: LANGUAGE_LABELS[settings.language] },
    { key: 'density', label: '정보 밀도', value: DENSITY_LABELS[settings.density] },
    { key: 'notifications', label: '활성 알림', value: enabledNotificationCount },
  ]

  return (
    <PageShell density="compact">
      <PageHeader
        eyebrow={
          <>
            <Settings className="h-3.5 w-3.5" />
            Personal Preferences
          </>
        }
        title="개인 설정"
        description="화면, 알림, 개인정보 공개 범위를 같은 패턴 안에서 관리할 수 있도록 정리한 설정 페이지입니다."
        actions={
          <>
            {onClose ? (
              <button type="button" onClick={onClose} className="glass-inline-button">
                닫기
              </button>
            ) : null}
            <button type="button" onClick={handleSave} className="glass-inline-button">
              <Save className="h-4 w-4" />
              저장
            </button>
          </>
        }
        meta={
          <>
            <Pill variant="subtle">현재 탭 {getTabLabel(activeTab)}</Pill>
            <Pill variant="subtle">알림 {enabledNotificationCount}개 활성</Pill>
            {saved ? <Pill variant="subtle">저장 완료</Pill> : null}
          </>
        }
      />

      <section className="page-metric-grid">
        {summaryMetrics.map((metric) => (
          <MetricCard key={metric.key} label={metric.label} value={metric.value} />
        ))}
      </section>

      <section className="page-toolbar-panel page-toolbar-stack">
        <div className="page-toolbar-row">
          <div className="page-toggle-cluster">
            {TAB_OPTIONS.map((tab) => {
              const Icon = tab.icon

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`page-toggle-button ${
                    activeTab === tab.id ? 'page-toggle-button-active' : 'page-toggle-button-idle'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              )
            })}
          </div>
          <span className="page-toolbar-note">
            모든 설정은 같은 레이아웃 규칙 안에서 정리해 두어 페이지를 넘겨도 사용감이 흔들리지 않도록 맞췄습니다.
          </span>
        </div>
      </section>

      {activeTab === 'appearance' ? (
        <section className="page-card-grid">
          <div className="page-panel-lg space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">테마</h2>
              <p className="mt-1 text-sm text-slate-500">앱 전체 분위기와 대비를 선택합니다.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(['light', 'dark', 'auto'] as Theme[]).map((theme) => (
                <OptionCard
                  key={theme}
                  active={settings.theme === theme}
                  title={THEME_LABELS[theme]}
                  description={
                    theme === 'light'
                      ? '밝고 깔끔한 기본 화면'
                      : theme === 'dark'
                        ? '대비가 높은 어두운 화면'
                        : '기기 설정에 맞춰 자동 전환'
                  }
                  onClick={() => updateTopLevel('theme', theme)}
                  preview={
                    <div
                      className={`h-14 rounded-2xl ${
                        theme === 'light'
                          ? 'border border-slate-200 bg-white'
                          : theme === 'dark'
                            ? 'bg-slate-900'
                            : 'bg-gradient-to-r from-white to-slate-900'
                      }`}
                    />
                  }
                />
              ))}
            </div>
          </div>

          <div className="page-panel-lg space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">언어</h2>
              <p className="mt-1 text-sm text-slate-500">기본 표시 언어를 선택합니다.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(['ko', 'en'] as Language[]).map((language) => (
                <OptionCard
                  key={language}
                  active={settings.language === language}
                  title={LANGUAGE_LABELS[language]}
                  description={language === 'ko' ? '한국어 인터페이스' : 'English interface'}
                  onClick={() => updateTopLevel('language', language)}
                />
              ))}
            </div>
          </div>

          <div className="page-panel-lg space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">정보 밀도</h2>
              <p className="mt-1 text-sm text-slate-500">카드 간격과 정보 배치를 조절합니다.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(['comfortable', 'compact'] as Density[]).map((density) => (
                <OptionCard
                  key={density}
                  active={settings.density === density}
                  title={DENSITY_LABELS[density]}
                  description={density === 'comfortable' ? '여유 있게 보기' : '더 많은 정보를 한 번에 보기'}
                  onClick={() => updateTopLevel('density', density)}
                />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === 'notifications' ? (
        <section className="page-list-stack">
          <ToggleRow
            title="이메일 알림"
            description="중요 업데이트를 이메일로 받아봅니다."
            checked={settings.notifications.email}
            onToggle={() => updateNotification('email', !settings.notifications.email)}
          />
          <ToggleRow
            title="푸시 알림"
            description="브라우저 알림으로 실시간 상태를 확인합니다."
            checked={settings.notifications.push}
            onToggle={() => updateNotification('push', !settings.notifications.push)}
          />
          <ToggleRow
            title="프로젝트 업데이트"
            description="관심 프로젝트의 변경 사항을 알려줍니다."
            checked={settings.notifications.projectUpdates}
            onToggle={() => updateNotification('projectUpdates', !settings.notifications.projectUpdates)}
          />
          <ToggleRow
            title="댓글 알림"
            description="내가 본 프로젝트와 토론에 새 댓글이 달리면 알려줍니다."
            checked={settings.notifications.newComments}
            onToggle={() => updateNotification('newComments', !settings.notifications.newComments)}
          />
          <ToggleRow
            title="추천 프로젝트"
            description="요즘 주목받는 프로젝트를 추천합니다."
            checked={settings.notifications.trending}
            onToggle={() => updateNotification('trending', !settings.notifications.trending)}
          />
        </section>
      ) : null}

      {activeTab === 'privacy' ? (
        <section className="page-list-stack">
          <ToggleRow
            title="프로필 공개"
            description="다른 사용자가 내 프로필과 요약 정보를 볼 수 있습니다."
            checked={settings.privacy.profilePublic}
            onToggle={() => updatePrivacy('profilePublic', !settings.privacy.profilePublic)}
          />
          <ToggleRow
            title="활동 내역 표시"
            description="최근 본 프로젝트와 활동 흔적을 프로필에 노출합니다."
            checked={settings.privacy.showActivity}
            onToggle={() => updatePrivacy('showActivity', !settings.privacy.showActivity)}
          />
          <ToggleRow
            title="즐겨찾기 표시"
            description="저장한 프로젝트 목록을 프로필에 함께 보여줍니다."
            checked={settings.privacy.showBookmarks}
            onToggle={() => updatePrivacy('showBookmarks', !settings.privacy.showBookmarks)}
          />
          <div className="page-panel border-sky-200 bg-sky-50/80">
            <p className="text-sm text-sky-800">
              개인정보 관련 설정은 저장 즉시 프로필과 목록 공개 범위에 반영됩니다.
            </p>
          </div>
        </section>
      ) : null}

      {activeTab === 'account' ? (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="page-panel-lg space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">계정 정보</h2>
              <p className="mt-1 text-sm text-slate-500">현재 계정 상태와 기본 프로필 정보를 요약해서 보여줍니다.</p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">이름</p>
                <p className="mt-2 text-base font-semibold text-slate-900">J. Kim</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">이메일</p>
                <p className="mt-2 text-base font-semibold text-slate-900">jkim@jb-hub.local</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">소속</p>
                <p className="mt-2 text-base font-semibold text-slate-900">IT 디지털</p>
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white/80 p-5">
              <p className="text-sm font-semibold text-slate-900">계정 보안</p>
              <p className="mt-1 text-sm text-slate-500">
                비밀번호 변경, 2단계 인증, 장치 세션 관리는 다음 단계에서 연결할 수 있도록 블록 구조를 맞춰 두었습니다.
              </p>
            </div>
          </div>

          <div className="page-panel-lg space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">위험 작업</h2>
              <p className="mt-1 text-sm text-slate-500">영구적인 변경이 발생할 수 있는 항목입니다.</p>
            </div>
            <button
              type="button"
              className="w-full rounded-2xl border border-rose-200 px-4 py-3 text-left text-rose-600 transition hover:bg-rose-50"
            >
              계정 데이터 내보내기
            </button>
            <button
              type="button"
              className="w-full rounded-2xl border border-rose-200 px-4 py-3 text-left text-rose-600 transition hover:bg-rose-50"
            >
              계정 비활성화
            </button>
          </div>
        </section>
      ) : null}
    </PageShell>
  )
}
