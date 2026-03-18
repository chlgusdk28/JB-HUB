import { Star } from 'lucide-react'
import { memo } from 'react'
import type { Project } from '../../lib/project-utils'
import { OpalProjectCard } from '../opal/OpalProjectCard'

interface ProjectPreviewCardProps {
  project: Project
  rank?: number
  revealIndex?: number
  isFavorite: boolean
  density?: 'comfortable' | 'compact'
  onToggleFavorite: (projectId: number) => void
  onProjectClick: (projectId: number) => void
}

export const ProjectPreviewCard = memo(function ProjectPreviewCard({
  project,
  rank,
  revealIndex = 0,
  isFavorite,
  density = 'comfortable',
  onToggleFavorite,
  onProjectClick,
}: ProjectPreviewCardProps) {
  const animationDelay = Math.min(revealIndex * 0.05, 0.35)

  return (
    <div className="fade-up relative" style={{ animationDelay: `${animationDelay}s` }}>
      {rank ? (
        <div className="rank-badge">
          #{rank}
        </div>
      ) : null}

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onToggleFavorite(project.id)
        }}
        className="favorite-toggle-btn"
        aria-label={isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
        title={isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
      >
        <Star className={`h-4 w-4 ${isFavorite ? 'fill-[#4f7394] text-[#385f83]' : ''}`} />
      </button>

      <OpalProjectCard {...project} density={density} onClick={() => onProjectClick(project.id)} />
    </div>
  )
})
