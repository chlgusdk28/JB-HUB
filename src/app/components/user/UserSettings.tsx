import { useState, useEffect } from 'react'
import { Settings, Palette, Bell, Shield, Save } from 'lucide-react'

export type Theme = 'light' | 'dark' | 'auto'
export type Language = 'ko' | 'en'
export type Density = 'comfortable' | 'compact'

interface UserSettings {
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
  onSave?: (settings: UserSettings) => void
  onClose?: () => void
}

const STORAGE_KEY = 'jb-hub:user-settings'

const DEFAULT_SETTINGS: UserSettings = {
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

export function loadUserSettings(): UserSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveUserSettings(settings: UserSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    // 테마 적용
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else if (settings.theme === 'light') {
      document.documentElement.classList.remove('dark')
    } else {
      // auto
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      document.documentElement.classList.toggle('dark', prefersDark)
    }
  } catch (e) {
    console.error('Failed to save settings:', e)
  }
}

export function UserSettings({ onSave, onClose }: UserSettingsProps) {
  const [settings, setSettings] = useState<UserSettings>(() => loadUserSettings())
  const [activeTab, setActiveTab] = useState<'appearance' | 'notifications' | 'privacy' | 'account'>('appearance')
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    saveUserSettings(settings)
    setSaved(true)
    onSave?.(settings)
    setTimeout(() => setSaved(false), 2000)
  }

  const updateSettings = (path: string, value: any) => {
    setSettings((prev) => {
      const updated = { ...prev }
      const keys = path.split('.')
      let current: any = updated
      for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]]
      }
      current[keys[keys.length - 1]] = value
      return updated
    })
  }

  const tabs = [
    { id: 'appearance', label: '외관', icon: Palette },
    { id: 'notifications', label: '알림', icon: Bell },
    { id: 'privacy', label: '개인정보', icon: Shield },
    { id: 'account', label: '계정', icon: Settings },
  ]

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Settings className="h-6 w-6 text-slate-700" />
          <h1 className="text-2xl font-bold text-slate-900">설정</h1>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="flex items-center gap-1 text-sm text-sky-700">
              <Save className="h-4 w-4" />
              저장됨
            </span>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="glass-inline-button !px-3 !py-1.5 text-xs"
            >
              닫기
            </button>
          )}
          <button
            onClick={handleSave}
            className="inline-flex items-center gap-2 rounded-xl border border-[#264969] bg-[#264969] px-4 py-2 text-sm font-semibold text-white transition-colors hover:border-[#1f3e5a] hover:bg-[#1f3e5a]"
          >
            <Save className="h-4 w-4" />
            저장
          </button>
        </div>
      </div>

      <div className="surface-panel overflow-hidden rounded-2xl">
        {/* 탭 네비게이션 */}
        <div className="border-b border-slate-200/80 p-4">
          <nav className="action-row">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`chip-filter inline-flex items-center gap-2 ${
                    activeTab === tab.id
                      ? 'chip-filter-active'
                      : 'chip-filter-idle'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              )
            })}
          </nav>
        </div>

        {/* 탭 내용 */}
        <div className="p-6">
          {activeTab === 'appearance' && (
            <div className="space-y-6">
              <div>
                <h3 className="mb-4 text-lg font-semibold text-slate-900">테마</h3>
                <div className="grid grid-cols-3 gap-4">
                  {(['light', 'dark', 'auto'] as Theme[]).map((theme) => (
                    <button
                      key={theme}
                      onClick={() => updateSettings('theme', theme)}
                      className={`rounded-xl border p-4 transition-all ${
                        settings.theme === theme
                          ? 'border-[#315779]/40 bg-[#eaf1f8]'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <div
                          className={`w-12 h-12 rounded-lg ${
                            theme === 'light'
                              ? 'bg-white border border-slate-200'
                              : theme === 'dark'
                              ? 'bg-slate-900'
                              : 'bg-gradient-to-r from-white to-gray-900'
                          }`}
                        />
                        <span className="font-medium">
                          {theme === 'light' ? '라이트' : theme === 'dark' ? '다크' : '시스템'}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="mb-4 text-lg font-semibold text-slate-900">언어</h3>
                <div className="grid grid-cols-2 gap-4 max-w-xs">
                  {(['ko', 'en'] as Language[]).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => updateSettings('language', lang)}
                      className={`rounded-xl border p-4 transition-all ${
                        settings.language === lang
                          ? 'border-[#315779]/40 bg-[#eaf1f8]'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      {lang === 'ko' ? '🇰🇷 한국어' : '🇺🇸 English'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="mb-4 text-lg font-semibold text-slate-900">밀도</h3>
                <div className="grid grid-cols-2 gap-4 max-w-xs">
                  {(['comfortable', 'compact'] as Density[]).map((density) => (
                    <button
                      key={density}
                      onClick={() => updateSettings('density', density)}
                      className={`rounded-xl border p-4 transition-all ${
                        settings.density === density
                          ? 'border-[#315779]/40 bg-[#eaf1f8]'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      {density === 'comfortable' ? '여유 있게' : '컴팩트'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-slate-900">알림 설정</h3>

              <div className="space-y-4">
                {[
                  { key: 'email', label: '이메일 알림', desc: '중요한 업데이트를 이메일로 받습니다' },
                  { key: 'push', label: '푸시 알림', desc: '브라우저 알림을 받습니다' },
                  { key: 'projectUpdates', label: '프로젝트 업데이트', desc: '저장한 프로젝트의 업데이트 알림' },
                  { key: 'newComments', label: '새 댓글', desc: '내 댓글에 답글이 달리면 알림' },
                  { key: 'trending', label: '인기 프로젝트', desc: '트렌딩 프로젝트 알림' },
                ].map((item) => (
                  <div key={item.key} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                    <div>
                      <p className="font-medium text-slate-900">{item.label}</p>
                      <p className="text-sm text-slate-500">{item.desc}</p>
                    </div>
                    <button
                      onClick={() => updateSettings(`notifications.${item.key}`, !settings.notifications[item.key as keyof typeof settings.notifications])}
                      className={`relative w-12 h-6 rounded-full transition-colors ${
                        settings.notifications[item.key as keyof typeof settings.notifications]
                          ? 'bg-[#315779]'
                          : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                          settings.notifications[item.key as keyof typeof settings.notifications]
                            ? 'translate-x-7'
                            : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'privacy' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-slate-900">개인정보 설정</h3>

              <div className="space-y-4">
                {[
                  { key: 'profilePublic', label: '프로필 공개', desc: '다른 사용자가 내 프로필을 볼 수 있습니다' },
                  { key: 'showActivity', label: '활동 표시', desc: '최근 활동을 다른 사용자에게 표시' },
                  { key: 'showBookmarks', label: '저장한 프로젝트 표시', desc: '저장한 프로젝트 목록을 공개' },
                ].map((item) => (
                  <div key={item.key} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                    <div>
                      <p className="font-medium text-slate-900">{item.label}</p>
                      <p className="text-sm text-slate-500">{item.desc}</p>
                    </div>
                    <button
                      onClick={() => updateSettings(`privacy.${item.key}`, !settings.privacy[item.key as keyof typeof settings.privacy])}
                      className={`relative w-12 h-6 rounded-full transition-colors ${
                        settings.privacy[item.key as keyof typeof settings.privacy]
                          ? 'bg-[#315779]'
                          : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                          settings.privacy[item.key as keyof typeof settings.privacy]
                            ? 'translate-x-7'
                            : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
                <p className="text-sm text-sky-800">
                  ⚠️ 개인정보 설정 변경은 즉시 적용됩니다.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'account' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-slate-900">계정 정보</h3>

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">이름</label>
                  <input
                    type="text"
                    defaultValue="홍길동"
                    className="select-soft"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">이메일</label>
                  <input
                    type="email"
                    defaultValue="honggildong@example.com"
                    className="select-soft"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">부서</label>
                  <input
                    type="text"
                    defaultValue="IT기획팀"
                    className="select-soft"
                  />
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <h4 className="mb-3 font-medium text-slate-900">위험한 영역</h4>
                <div className="space-y-3">
                  <button className="w-full rounded-lg border border-rose-200 px-4 py-3 text-left text-rose-600 transition-colors hover:bg-rose-50">
                    데이터 내보내기
                  </button>
                  <button className="w-full rounded-lg border border-rose-200 px-4 py-3 text-left text-rose-600 transition-colors hover:bg-rose-50">
                    계정 삭제
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
