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
      className={`chip-filter ${isActive ? 'chip-filter-active' : 'chip-filter-idle'} ${className}`.trim()}
      aria-pressed={isActive}
    >
      {children}
    </button>
  )
}

export const FilterChip = memo(FilterChipBase)
FilterChip.displayName = 'FilterChip'
