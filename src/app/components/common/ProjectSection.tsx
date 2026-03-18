import type { ReactNode } from 'react'
import type { Project } from '../../lib/project-utils'

interface ProjectSectionProps {
  title: string
  projects: Project[]
  renderProjectCard: (project: Project, index: number) => ReactNode
  icon?: ReactNode
  rightSlot?: ReactNode
  forceRender?: boolean
  gridClassName?: string
}

export function ProjectSection({
  title,
  projects,
  renderProjectCard,
  icon,
  rightSlot,
  forceRender = false,
  gridClassName = 'grid grid-cols-1 gap-4 lg:grid-cols-2',
}: ProjectSectionProps) {
  if (!forceRender && projects.length === 0) {
    return null
  }

  return (
    <section className="project-section-shell">
      <div className="project-section-head">
        <div className="project-section-title-row">
          {icon ? <span className="project-section-icon">{icon}</span> : <span className="project-section-dot" aria-hidden="true" />}
          <h2 className="project-section-title">{title}</h2>
        </div>
        {rightSlot}
      </div>
      <div className="project-section-divider" aria-hidden="true" />

      <div className={`project-section-grid ${gridClassName}`}>
        {projects.map((project, index) => renderProjectCard(project, index))}
      </div>
    </section>
  )
}
