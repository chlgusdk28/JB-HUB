import { LucideIcon } from './types'

interface EmptyStateProps {
  icon?: LucideIcon
  title?: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

export function EmptyState({
  icon: Icon,
  title = '결과가 없습니다',
  description = '검색 조건이나 필터를 변경해보세요',
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`empty-panel flex flex-col items-center justify-center py-16 ${className}`.trim()}>
      {Icon && (
        <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mb-4">
          <Icon className="w-8 h-8 text-slate-400" />
        </div>
      )}
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
        {title}
      </h3>
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
        {description}
      </p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="px-4 py-2 bg-gradient-to-r from-slate-700 to-slate-500 text-white rounded-lg text-sm font-medium transition-all hover:scale-105 hover:shadow-lg"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

interface EmptyStateIllustrationProps {
  type: 'search' | 'filter' | 'error' | 'projects' | 'discussions'
  title?: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}

const ILLUSTRATIONS = {
  search: { emoji: '🔍', defaultTitle: '검색 결과가 없습니다' },
  filter: { emoji: '🎯', defaultTitle: '필터링된 결과가 없습니다' },
  error: { emoji: '⚠️', defaultTitle: '오류가 발생했습니다' },
  projects: { emoji: '📁', defaultTitle: '프로젝트가 없습니다' },
  discussions: { emoji: '💬', defaultTitle: '토론이 없습니다' },
}

export function EmptyStateIllustration({
  type,
  title,
  description,
  action,
}: EmptyStateIllustrationProps) {
  const illustration = ILLUSTRATIONS[type]

  return (
    <div className="empty-panel flex flex-col items-center justify-center py-16">
      <span className="text-5xl mb-4">{illustration.emoji}</span>
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
        {title || illustration.defaultTitle}
      </h3>
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 max-w-md text-center">
        {description}
      </p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="px-4 py-2 bg-gradient-to-r from-slate-700 to-slate-500 text-white rounded-lg text-sm font-medium transition-all hover:scale-105 hover:shadow-lg"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
