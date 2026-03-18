import type { ReactNode } from 'react'
import { cn } from '../ui/utils'

type PageShellDensity = 'default' | 'compact' | 'relaxed'
type PageShellTopInset = 'default' | 'none'

interface PageShellProps {
  children: ReactNode
  density?: PageShellDensity
  topInset?: PageShellTopInset
  className?: string
}

const densityClassName: Record<PageShellDensity, string> = {
  default: 'page-shell',
  compact: 'page-shell-tight',
  relaxed: 'page-shell-relaxed',
}

export function PageShell({
  children,
  density = 'default',
  topInset = 'default',
  className,
}: PageShellProps) {
  return (
    <div
      className={cn(
        densityClassName[density],
        topInset === 'none' && 'page-shell-no-top',
        className,
      )}
    >
      {children}
    </div>
  )
}
