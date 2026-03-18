import type { ReactNode } from 'react'

interface PillProps {
  children: ReactNode
  variant?: 'soft' | 'subtle' | 'solid'
  className?: string
}

export function Pill({ children, variant = 'soft', className = '' }: PillProps) {
  const variantClass = {
    soft: 'pill-soft border border-white/35 bg-white/16 text-slate-50 backdrop-blur-sm',
    subtle: 'pill-subtle border border-slate-300/80 bg-slate-100/80 text-slate-700',
    solid: 'pill-solid border border-[#0f4f66] bg-[#0f4f66] text-white',
  }[variant]

  return (
    <span className={`pill inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${variantClass} ${className}`}>
      <span className="pill-inner">{children}</span>
    </span>
  )
}
