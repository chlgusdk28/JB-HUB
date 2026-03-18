import type { ReactNode } from 'react'
import { cn } from '../ui/utils'

interface PageHeaderProps {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  meta?: ReactNode
  className?: string
  titleClassName?: string
  descriptionClassName?: string
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
  className,
  titleClassName,
  descriptionClassName,
}: PageHeaderProps) {
  return (
    <header className={cn('page-header-card', className)}>
      <div className="page-header-stack">
        <div className="page-header-copy">
          {eyebrow ? <div className="page-header-eyebrow">{eyebrow}</div> : null}
          <h1 className={cn('page-header-title', titleClassName)}>{title}</h1>
          {description ? (
            <p className={cn('page-header-description', descriptionClassName)}>{description}</p>
          ) : null}
        </div>
        {actions ? <div className="page-header-actions">{actions}</div> : null}
      </div>
      {meta ? <div className="page-header-meta">{meta}</div> : null}
    </header>
  )
}
