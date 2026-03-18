interface QuietTabsProps {
  tabs: Array<{ id: string; label: string }>
  activeTab: string
  onTabChange: (tabId: string) => void
}

export function QuietTabs({ tabs, activeTab, onTabChange }: QuietTabsProps) {
  return (
    <nav className="action-row rounded-2xl border border-slate-200/80 bg-white/80 p-2" aria-label="상세 탭">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`chip-filter ${isActive ? 'chip-filter-active' : 'chip-filter-idle'}`}
            aria-pressed={isActive}
          >
            {tab.label}
          </button>
        )
      })}
    </nav>
  )
}
