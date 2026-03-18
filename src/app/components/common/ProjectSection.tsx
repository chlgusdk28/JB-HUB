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
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-slate-900">
          {icon}
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
        </div>
        {rightSlot}
      </div>

      <div className={gridClassName}>
        {projects.map((project, index) => renderProjectCard(project, index))}
      </div>
    </section>
  )
}
