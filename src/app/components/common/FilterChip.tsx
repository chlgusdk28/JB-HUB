import { memo, type ReactNode } from 'react'

interface FilterChipProps {
  children: ReactNode
  isActive: boolean
  onClick: () => void
  className?: string
}

function FilterChipBase({ children, isActive, onClick, className = '' }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`filter-chip-button chip-filter ${isActive ? 'chip-filter-active' : 'chip-filter-idle'} ${className}`.trim()}
      aria-pressed={isActive}
    >
      <span className="filter-chip-label">{children}</span>
    </button>
  )
}

export const FilterChip = memo(FilterChipBase)
FilterChip.displayName = 'FilterChip'
