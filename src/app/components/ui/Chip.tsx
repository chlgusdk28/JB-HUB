import { memo } from 'react'
import { X } from 'lucide-react'

interface ChipProps {
  children: React.ReactNode
  variant?: 'default' | 'active' | 'removable'
  size?: 'sm' | 'md'
  onRemove?: () => void
  className?: string
}

export const Chip = memo(function Chip({
  children,
  variant = 'default',
  size = 'md',
  onRemove,
  className = '',
}: ChipProps) {
  const baseClasses = 'inline-flex items-center gap-1.5 rounded-full font-medium transition-all'

  const variantClasses = {
    default: 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600',
    active: 'bg-gradient-to-r from-slate-700 to-slate-500 text-white shadow-md',
    removable: 'bg-white border border-slate-200 text-slate-700 hover:border-slate-300 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-300',
  }

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
  }

  return (
    <span className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`.trim()}>
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="hover:bg-black/10 dark:hover:bg-white/20 rounded-full p-0.5 transition-colors"
          aria-label="제거"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  )
})

interface FilterChipProps {
  label: string
  isActive: boolean
  onClick: () => void
  onRemove?: () => void
}

export const FilterChip = memo(function FilterChip({ label, isActive, onClick, onRemove }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        chip-filter transition-all
        ${isActive ? 'chip-filter-active' : 'chip-filter-idle'}
      `}
    >
      {label}
      {isActive && onRemove && (
        <X className="h-3 w-3 ml-1" onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }} />
      )}
    </button>
  )
})
