import { useMemo } from 'react'
import { renderMarkdownHtml } from '../../lib/markdown'
import { cn } from '../ui/utils'

interface MarkdownContentProps {
  markdown: string
  className?: string
  variant?: 'default' | 'hero' | 'editor'
}

const variantClassName = {
  default: '',
  hero: 'markdown-content-hero',
  editor: 'markdown-content-editor',
}

export function MarkdownContent({
  markdown,
  className,
  variant = 'default',
}: MarkdownContentProps) {
  const html = useMemo(() => renderMarkdownHtml(markdown), [markdown])

  return (
    <div
      className={cn('markdown-content', variantClassName[variant], className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
