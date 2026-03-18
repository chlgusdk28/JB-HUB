import { memo } from 'react'
import type { ProjectCardDensity } from '../../types/page'

interface CardDensityToggleProps {
  value: ProjectCardDensity
  onChange: (density: ProjectCardDensity) => void
  className?: string
}

const DENSITY_OPTIONS: Array<{ value: ProjectCardDensity; label: string }> = [
  { value: 'comfortable', label: '여유' },
  { value: 'compact', label: '컴팩트' },
]

function CardDensityToggleBase({ value, onChange, className = '' }: CardDensityToggleProps) {
  return (
    <div className={`flex items-center gap-1 rounded-full border border-white/85 bg-white/75 px-1 py-1 ${className}`.trim()}>
      {DENSITY_OPTIONS.map((option) => {
        const active = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`chip-filter ${active ? 'chip-filter-active' : 'chip-filter-idle'} !px-2.5 !py-1`}
            aria-pressed={active}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export const CardDensityToggle = memo(CardDensityToggleBase)
CardDensityToggle.displayName = 'CardDensityToggle'
