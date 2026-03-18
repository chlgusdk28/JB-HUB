import type { SortOption } from '../constants/translations'

export interface Project {
  id: string
  title: string
  description: string
  category: string
  tags: string[]
  author: {
    name: string
    avatar?: string
  }
  department: string
  status: 'active' | 'completed' | 'planned'
  createdAt: Date
  updatedAt: Date
  views: number
  bookmarks: number
  rating: number
  image?: string
}

export interface CategoryDefinition {
  id: string
  label: string
  icon: string
  color: string
  count?: number
}

export const CATEGORY_DEFINITIONS: CategoryDefinition[] = [
  { id: 'all', label: '전체', icon: 'LayoutGrid', color: '#0f4f66' },
  { id: 'web', label: '웹', icon: 'Globe', color: '#3b82f6' },
  { id: 'mobile', label: '모바일', icon: 'Smartphone', color: '#8b5cf6' },
  { id: 'desktop', label: '데스크톱', icon: 'Monitor', color: '#10b981' },
  { id: 'design', label: '디자인', icon: 'Palette', color: '#f59e0b' },
  { id: 'ai', label: 'AI', icon: 'Brain', color: '#ef4444' },
]

export function computeCategoryCounts(projects: Project[]): Record<string, number> {
  return projects.reduce((acc, project) => {
    acc[project.category] = (acc[project.category] || 0) + 1
    return acc
  }, {} as Record<string, number>)
}

export function matchesSearchQuery(project: Project, query: string): boolean {
  if (!query) return true
  const lowerQuery = query.toLowerCase()
  return (
    project.title.toLowerCase().includes(lowerQuery) ||
    project.description.toLowerCase().includes(lowerQuery) ||
    project.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
  )
}

export function resolveCategoryId(categoryId: string): string {
  return CATEGORY_DEFINITIONS.find(def => def.id === categoryId)?.id || 'all'
}

export function sortProjects(projects: Project[], sortOption: SortOption): Project[] {
  const sorted = [...projects]

  switch (sortOption) {
    case 'latest':
      return sorted.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    case 'popular':
      return sorted.sort((a, b) => b.views - a.views)
    case 'rated':
      return sorted.sort((a, b) => b.rating - a.rating)
    case 'bookmarked':
      return sorted.sort((a, b) => b.bookmarks - a.bookmarks)
    default:
      return sorted
  }
}
