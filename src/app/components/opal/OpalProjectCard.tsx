import { Eye, GitFork, MessageSquare, Star } from 'lucide-react'
import { OpalTag } from './OpalTag'

interface ProjectCardProps {
  id: number
  title: string
  description: string
  author: string
  department: string
  stars: number
  forks: number
  views: number
  comments: number
  tags: string[]
  createdAt?: string
  isNew?: boolean
  onClick?: () => void
  density?: 'comfortable' | 'compact'
}

export function OpalProjectCard({
  title,
  description,
  author,
  department,
  stars,
  forks,
  views,
  comments,
  tags,
  createdAt,
  isNew,
  onClick,
  density = 'comfortable',
}: ProjectCardProps) {
  const isCompact = density === 'compact'

  const cardPaddingClass = isCompact ? 'p-4 sm:p-5' : 'p-6 sm:p-7'
  const titleClass = isCompact ? 'text-base sm:text-lg' : 'text-lg sm:text-xl'
  const descriptionClass = isCompact ? 'mb-4 min-h-0 text-xs sm:text-sm' : 'mb-6 min-h-12 text-sm sm:text-[15px]'
  const tagBlockClass = isCompact ? 'mb-4 flex flex-wrap gap-1' : 'mb-6 flex flex-wrap gap-1.5'
  const metaTopClass = isCompact ? 'space-y-2 border-t border-slate-200/80 pt-3' : 'space-y-3 border-t border-slate-200/80 pt-5'
  const statsClass = isCompact
    ? 'flex items-center gap-3 text-xs sm:gap-4'
    : 'flex items-center gap-4 text-sm sm:gap-5'

  return (
    <div
      onClick={onClick}
      className={`group relative cursor-pointer overflow-hidden rounded-[24px] border border-slate-200/85 bg-white/96 shadow-[0_8px_18px_rgba(17,37,56,0.06)] transition-[box-shadow,border-color] duration-200 hover:border-slate-300 hover:shadow-[0_14px_24px_rgba(14,33,51,0.1)] ${cardPaddingClass}`}
      style={{
        backdropFilter: 'blur(4px)',
      }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-slate-200/90" />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-[11px] font-semibold tracking-[0.08em] text-slate-500">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">{department}</span>
        {createdAt ? <span className="rounded-full bg-slate-100 px-2.5 py-1">{createdAt}</span> : null}
        {isNew ? (
          <span className="rounded-full border border-sky-200 bg-sky-100/80 px-2.5 py-1 text-sky-800">
            신규
          </span>
        ) : null}
      </div>

      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className={`flex-1 font-semibold leading-tight text-slate-900 ${titleClass}`}>{title}</h3>
      </div>

      <p className={`leading-relaxed text-slate-600 ${descriptionClass}`}>{description}</p>

      {tags && tags.length > 0 ? (
        <div className={tagBlockClass}>
          {tags.slice(0, 4).map((tag) => (
            <OpalTag key={tag} size="sm" variant="primary" category={tag}>
              {tag}
            </OpalTag>
          ))}
          {tags.length > 4 ? <OpalTag size="sm" variant="secondary">+{tags.length - 4}</OpalTag> : null}
        </div>
      ) : null}

      <div className={metaTopClass}>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 sm:text-sm">
          <span className="font-medium">{author}</span>
          <span>&middot;</span>
          <span>{department} 담당</span>
        </div>

        <div className={`rounded-2xl bg-slate-50/85 px-3 py-3 ${statsClass}`}>
          {views !== undefined ? (
            <div className="flex items-center gap-1.5 text-slate-500">
              <Eye className="h-4 w-4" strokeWidth={1.5} />
              <span className="font-medium tabular-nums">{views.toLocaleString()}</span>
            </div>
          ) : null}
          {stars !== undefined ? (
            <div className="flex items-center gap-1.5 text-slate-700">
              <Star className="h-4 w-4" strokeWidth={1.5} fill="currentColor" />
              <span className="font-bold tabular-nums">{stars}</span>
            </div>
          ) : null}
          {forks !== undefined ? (
            <div className="flex items-center gap-1.5 text-slate-600">
              <GitFork className="h-4 w-4" strokeWidth={1.5} />
              <span className="font-medium tabular-nums">{forks}</span>
            </div>
          ) : null}
          {comments !== undefined ? (
            <div className="flex items-center gap-1.5 text-slate-500">
              <MessageSquare className="h-4 w-4" strokeWidth={1.5} />
              <span className="font-medium tabular-nums">{comments}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

