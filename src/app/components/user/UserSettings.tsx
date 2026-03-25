import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Bell, Palette, Save, Settings, Shield } from 'lucide-react'
import { PageHeader, PageShell, Pill } from '../common'
import {
  applyUserSettings,
  loadUserSettings,
  saveUserSettings,
  type Density,
  type Language,
  type Theme,
  type UserSettingsState,
} from '../../lib/user-settings'
import type { HubSession } from '../../lib/hub-auth'

export type { Density, Language, Theme, UserSettingsState } from '../../lib/user-settings'

interface UserSettingsProps {
  value?: UserSettingsState
  onChange?: (settings: UserSettingsState) => void
  onSave?: (settings: UserSettingsState) => void
  onClose?: () => void
  currentUser?: Pick<HubSession, 'name' | 'username' | 'department' | 'role'>
}

type SettingsTab = 'appearance' | 'notifications' | 'privacy' | 'account'

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

function getTabLabel(tab: SettingsTab) {
  return TAB_OPTIONS.find((option) => option.id === tab)?.label ?? tab
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
        className={`relative h-6 w-12 rounded-full transition-colors ${checked ? 'bg-[#315779]' : 'bg-slate-300'}`}
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

export function UserSettings({
  value,
  onChange,
  onSave,
  onClose,
  currentUser,
}: UserSettingsProps) {
  const [settings, setSettings] = useState<UserSettingsState>(() => value ?? loadUserSettings())
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (value) {
      setSettings(value)
    }
  }, [value])

  useEffect(() => {
    applyUserSettings(settings)
  }, [settings])

  const enabledNotificationCount = useMemo(
    () => Object.values(settings.notifications).filter(Boolean).length,
    [settings.notifications],
  )

  const shellDensity = settings.density === 'compact' ? 'compact' : 'default'

  function updateSettings(updater: (previous: UserSettingsState) => UserSettingsState) {
    setSettings((previous) => {
      const next = updater(previous)
      onChange?.(next)
      return next
    })
  }

  const updateTopLevel = <K extends keyof Pick<UserSettingsState, 'theme' | 'language' | 'density'>>(
    key: K,
    value: UserSettingsState[K],
  ) => {
    updateSettings((previous) => ({
      ...previous,
      [key]: value,
    }))
  }

  const updateNotification = (key: keyof UserSettingsState['notifications'], value: boolean) => {
    updateSettings((previous) => ({
      ...previous,
      notifications: {
        ...previous.notifications,
        [key]: value,
      },
    }))
  }

  const updatePrivacy = (key: keyof UserSettingsState['privacy'], value: boolean) => {
    updateSettings((previous) => ({
      ...previous,
      privacy: {
        ...previous.privacy,
        [key]: value,
      },
    }))
  }

  const handleSave = () => {
    saveUserSettings(settings)
    onSave?.(settings)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2000)
  }

  return (
    <PageShell density={shellDensity}>
      <PageHeader
        variant="simple"
        eyebrow={
          <>
            <Settings className="h-3.5 w-3.5" />
            Personal Preferences
          </>
        }
        title="개인 설정"
        description="화면, 알림, 개인정보 공개 범위를 한곳에서 관리하고 저장 즉시 앱 화면에도 반영되도록 연결했습니다."
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
        meta={saved ? <Pill variant="subtle">저장 완료</Pill> : undefined}
      />

      <section className="page-panel space-y-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="page-summary-strip">
            <div className="page-summary-item">
              <span className="page-summary-label">현재 테마</span>
              <span className="page-summary-value">{THEME_LABELS[settings.theme]}</span>
            </div>
            <div className="page-summary-item">
              <span className="page-summary-label">언어</span>
              <span className="page-summary-value">{LANGUAGE_LABELS[settings.language]}</span>
            </div>
            <div className="page-summary-item">
              <span className="page-summary-label">정보 밀도</span>
              <span className="page-summary-value">{DENSITY_LABELS[settings.density]}</span>
            </div>
            <div className="page-summary-item">
              <span className="page-summary-label">활성 알림</span>
              <span className="page-summary-value">{enabledNotificationCount}</span>
            </div>
          </div>

          <span className="page-toolbar-note">설정값은 화면 미리보기에 바로 반영되고, 저장하면 다음 방문에도 유지됩니다.</span>
        </div>

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
      </section>

      {activeTab === 'appearance' ? (
        <section className="page-card-grid">
          <div className="page-panel space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">테마</h2>
              <p className="mt-1 text-sm text-slate-500">허브 전체 분위기와 대비를 선택합니다.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(['light', 'dark', 'auto'] as Theme[]).map((theme) => (
                <OptionCard
                  key={theme}
                  active={settings.theme === theme}
                  title={THEME_LABELS[theme]}
                  description={
                    theme === 'light'
                      ? '밝고 선명한 기본 화면'
                      : theme === 'dark'
                        ? '눈부심을 줄인 어두운 화면'
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

          <div className="page-panel space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">언어</h2>
              <p className="mt-1 text-sm text-slate-500">문서 언어와 기본 인터페이스 방향을 설정합니다.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(['ko', 'en'] as Language[]).map((language) => (
                <OptionCard
                  key={language}
                  active={settings.language === language}
                  title={LANGUAGE_LABELS[language]}
                  description={language === 'ko' ? '한국어 우선 환경' : 'English-first environment'}
                  onClick={() => updateTopLevel('language', language)}
                />
              ))}
            </div>
          </div>

          <div className="page-panel space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">정보 밀도</h2>
              <p className="mt-1 text-sm text-slate-500">프로젝트 카드 간격과 주요 화면의 여백을 조절합니다.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(['comfortable', 'compact'] as Density[]).map((density) => (
                <OptionCard
                  key={density}
                  active={settings.density === density}
                  title={DENSITY_LABELS[density]}
                  description={density === 'comfortable' ? '여유 있는 카드 간격과 넓은 호흡' : '더 많은 정보를 한 화면에 표시'}
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
            description="중요한 업데이트를 이메일로 받습니다."
            checked={settings.notifications.email}
            onToggle={() => updateNotification('email', !settings.notifications.email)}
          />
          <ToggleRow
            title="브라우저 알림"
            description="실시간 상태 변화를 브라우저 알림으로 확인합니다."
            checked={settings.notifications.push}
            onToggle={() => updateNotification('push', !settings.notifications.push)}
          />
          <ToggleRow
            title="프로젝트 업데이트"
            description="관심 프로젝트의 수정 사항을 알려줍니다."
            checked={settings.notifications.projectUpdates}
            onToggle={() => updateNotification('projectUpdates', !settings.notifications.projectUpdates)}
          />
          <ToggleRow
            title="댓글 알림"
            description="내가 본 프로젝트나 토론에 새 댓글이 달리면 알려줍니다."
            checked={settings.notifications.newComments}
            onToggle={() => updateNotification('newComments', !settings.notifications.newComments)}
          />
          <ToggleRow
            title="추천 프로젝트"
            description="주목받는 프로젝트를 추천 카드와 알림에 반영합니다."
            checked={settings.notifications.trending}
            onToggle={() => updateNotification('trending', !settings.notifications.trending)}
          />
        </section>
      ) : null}

      {activeTab === 'privacy' ? (
        <section className="page-list-stack">
          <ToggleRow
            title="프로필 공개"
            description="프로필 화면에서 공개 상태가 표시되고 공유 가능한 사용자로 보입니다."
            checked={settings.privacy.profilePublic}
            onToggle={() => updatePrivacy('profilePublic', !settings.privacy.profilePublic)}
          />
          <ToggleRow
            title="활동 이력 표시"
            description="프로필의 최근 본 프로젝트와 활동 요약 영역을 표시합니다."
            checked={settings.privacy.showActivity}
            onToggle={() => updatePrivacy('showActivity', !settings.privacy.showActivity)}
          />
          <ToggleRow
            title="즐겨찾기 표시"
            description="프로필에서 즐겨찾기 프로젝트 섹션을 공개합니다."
            checked={settings.privacy.showBookmarks}
            onToggle={() => updatePrivacy('showBookmarks', !settings.privacy.showBookmarks)}
          />
          <div className="page-panel border-sky-200 bg-sky-50/80">
            <p className="text-sm text-sky-800">프라이버시 설정은 저장 후 프로필 화면에 바로 반영됩니다.</p>
          </div>
        </section>
      ) : null}

      {activeTab === 'account' ? (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="page-panel space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">계정 정보</h2>
              <p className="mt-1 text-sm text-slate-500">현재 로그인한 사용자의 기본 정보를 확인합니다.</p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">이름</p>
                <p className="mt-2 text-base font-semibold text-slate-900">{currentUser?.name ?? '알 수 없음'}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">아이디</p>
                <p className="mt-2 text-base font-semibold text-slate-900">{currentUser?.username ?? '-'}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">부서</p>
                <p className="mt-2 text-base font-semibold text-slate-900">{currentUser?.department ?? '-'}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">권한</p>
                <p className="mt-2 text-base font-semibold text-slate-900">
                  {currentUser?.role === 'admin' ? '관리자' : '구성원'}
                </p>
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white/80 p-5">
              <p className="text-sm font-semibold text-slate-900">적용 상태</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Pill variant="subtle">테마 {THEME_LABELS[settings.theme]}</Pill>
                <Pill variant="subtle">언어 {LANGUAGE_LABELS[settings.language]}</Pill>
                <Pill variant="subtle">밀도 {DENSITY_LABELS[settings.density]}</Pill>
                <Pill variant="subtle">{settings.privacy.profilePublic ? '프로필 공개' : '프로필 비공개'}</Pill>
              </div>
            </div>
          </div>

          <div className="page-panel space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">안내</h2>
              <p className="mt-1 text-sm text-slate-500">개인설정은 현재 허브 UI 기준으로 적용 가능한 항목부터 연결되어 있습니다.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm leading-6 text-slate-600">
              화면 설정은 즉시 미리보기되고, 저장 시 다시 방문해도 유지됩니다. 프라이버시 옵션은 프로필 화면의 공개 상태와 섹션 노출에
              반영됩니다.
            </div>
          </div>
        </section>
      ) : null}
    </PageShell>
  )
}
