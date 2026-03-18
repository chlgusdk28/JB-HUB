import { ReactNode } from 'react'

interface OpalCardProps {
  children: ReactNode
  onClick?: () => void
  padding?: 'compact' | 'comfortable' | 'spacious'
  elevation?: 'none' | 'minimal' | 'low'
}

export function OpalCard({
  children,
  onClick,
  padding = 'comfortable',
  elevation = 'minimal',
}: OpalCardProps) {
  const paddingStyles = {
    compact: 'p-5',
    comfortable: 'p-7',
    spacious: 'p-9',
  }

  const elevationStyles = {
    none: 'shadow-none',
    minimal: 'shadow-[0_6px_14px_rgba(16,47,77,0.08)]',
    low: 'shadow-[0_10px_20px_rgba(16,47,77,0.12)]',
  }

  const interactiveStyles = {
    none: '',
    minimal: 'hover:border-slate-300 hover:shadow-[0_10px_20px_rgba(16,47,77,0.1)]',
    low: 'hover:border-slate-300 hover:shadow-[0_14px_24px_rgba(16,47,77,0.14)]',
  }

  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border border-slate-200/85 bg-white/95 transition-[box-shadow,border-color] duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${paddingStyles[padding]} ${elevationStyles[elevation]} ${onClick ? interactiveStyles[elevation] : ''} ${onClick ? 'cursor-pointer' : ''}`}
      style={{ backdropFilter: 'blur(4px)' }}
    >
      {children}
    </div>
  )
}

