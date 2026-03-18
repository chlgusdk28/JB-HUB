import { type Dispatch, type SetStateAction, useMemo } from 'react'
import type { DiscussionComment, DiscussionPost } from '../data/discussions'
import {
  normalizeQuery,
  resolveCategoryId,
  sortProjects,
  type CategoryDefinition,
  type Project,
  type SortOption,
} from '../lib/project-utils'
import type { ProjectCardDensity } from '../types/page'

interface ActiveFilterChip {
  key: string
  label: string
  value: string | number
  onRemove: () => void
}

interface UseProjectViewModelOptions {
  allProjects: Project[]
  discussions: DiscussionPost[]
  discussionComments: Record<number, DiscussionComment[]>
  deferredSearchQuery: string
  favoriteIds: number[]
  minStars: number
  projectCardDensity: ProjectCardDensity
  recentProjectIds: number[]
  selectedCategory: string
  selectedDepartment: string
  selectedDiscussionId: number | null
  selectedProjectId: number | null
  showFavoritesOnly: boolean
  showNewOnly: boolean
  sortBy: SortOption
  categoryDefinitions: CategoryDefinition[]
  categoryLabels: Record<string, string>
  sortOptionLabels: Record<SortOption, string>
  setMinStars: Dispatch<SetStateAction<number>>
  setProjectCardDensity: Dispatch<SetStateAction<ProjectCardDensity>>
  setSelectedCategory: Dispatch<SetStateAction<string>>
  setSelectedDepartment: Dispatch<SetStateAction<string>>
  setShowFavoritesOnly: Dispatch<SetStateAction<boolean>>
  setShowNewOnly: Dispatch<SetStateAction<boolean>>
}

interface IndexedProjectEntry {
  project: Project
  categoryId: string
  searchableText: string
}

export function useProjectViewModel({
  allProjects,
  discussions,
  discussionComments,
  deferredSearchQuery,
  favoriteIds,
  minStars,
  projectCardDensity,
  recentProjectIds,
  selectedCategory,
  selectedDepartment,
  selectedDiscussionId,
  selectedProjectId,
  showFavoritesOnly,
  showNewOnly,
  sortBy,
  categoryDefinitions,
  categoryLabels,
  sortOptionLabels,
  setMinStars,
  setProjectCardDensity,
  setSelectedCategory,
  setSelectedDepartment,
  setShowFavoritesOnly,
  setShowNewOnly,
}: UseProjectViewModelOptions) {
  const favoriteIdSet = useMemo(() => new Set(favoriteIds), [favoriteIds])
  const normalizedQuery = useMemo(() => normalizeQuery(deferredSearchQuery), [deferredSearchQuery])

  const projectById = useMemo(() => new Map(allProjects.map((project) => [project.id, project])), [allProjects])

  const indexedProjects = useMemo<IndexedProjectEntry[]>(
    () =>
      allProjects.map((project) => ({
        project,
        categoryId: resolveCategoryId(project, categoryDefinitions),
        searchableText: [project.title, project.description, project.author, project.department, ...project.tags]
          .join(' ')
          .toLowerCase(),
      })),
    [allProjects, categoryDefinitions],
  )

  const searchMatchedEntries = useMemo(
    () => (normalizedQuery ? indexedProjects.filter((entry) => entry.searchableText.includes(normalizedQuery)) : indexedProjects),
    [indexedProjects, normalizedQuery],
  )

  const searchMatchedProjects = useMemo(() => searchMatchedEntries.map((entry) => entry.project), [searchMatchedEntries])

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const category of categoryDefinitions) {
      counts[category.id] = 0
    }
    for (const entry of searchMatchedEntries) {
      counts.all = (counts.all ?? 0) + 1
      if (entry.categoryId !== 'all') {
        counts[entry.categoryId] = (counts[entry.categoryId] ?? 0) + 1
      }
    }
    return counts
  }, [searchMatchedEntries, categoryDefinitions])

  const visibleProjects = useMemo(() => {
    const normalizedMinStars = Number.isFinite(minStars) ? Math.max(0, minStars) : 0
    const scoped = searchMatchedEntries
      .filter(({ project, categoryId }) => {
        if (selectedCategory !== 'all' && categoryId !== selectedCategory) {
          return false
        }
        if (selectedDepartment !== 'all' && project.department !== selectedDepartment) {
          return false
        }
        if (project.stars < normalizedMinStars) {
          return false
        }
        if (showNewOnly && !project.isNew) {
          return false
        }
        if (showFavoritesOnly && !favoriteIdSet.has(project.id)) {
          return false
        }
        return true
      })
      .map((entry) => entry.project)

    return sortProjects(scoped, sortBy, normalizedQuery)
  }, [
    searchMatchedEntries,
    selectedCategory,
    selectedDepartment,
    minStars,
    showNewOnly,
    showFavoritesOnly,
    favoriteIdSet,
    sortBy,
    normalizedQuery,
  ])

  const bestProjects = useMemo(
    () => [...visibleProjects].sort((a, b) => b.stars - a.stars).slice(0, 3),
    [visibleProjects],
  )

  const risingProjects = useMemo(() => visibleProjects.filter((project) => project.trend === 'rising'), [visibleProjects])

  const favoriteProjects = useMemo(
    () => sortProjects(allProjects.filter((project) => favoriteIdSet.has(project.id)), 'stars', ''),
    [allProjects, favoriteIdSet],
  )

  const recentProjects = useMemo(() => {
    return recentProjectIds.map((id) => projectById.get(id)).filter((project): project is Project => Boolean(project))
  }, [recentProjectIds, projectById])

  const departmentOptions = useMemo(() => {
    const uniqueDepartments = new Set(allProjects.map((project) => project.department))
    return ['all', ...Array.from(uniqueDepartments).sort((a, b) => a.localeCompare(b))]
  }, [allProjects])

  const activeCategoryLabel = useMemo(() => categoryLabels[selectedCategory] ?? selectedCategory, [selectedCategory, categoryLabels])
  const activeDepartmentLabel = useMemo(
    () => (selectedDepartment === 'all' ? '전체 부서' : selectedDepartment),
    [selectedDepartment],
  )
  const activeSortLabel = useMemo(() => sortOptionLabels[sortBy], [sortBy, sortOptionLabels])

  const activeFilterChips = useMemo<ActiveFilterChip[]>(() => {
    const chips: ActiveFilterChip[] = []
    if (selectedCategory !== 'all') {
      chips.push({
        key: 'category',
        label: '카테고리',
        value: activeCategoryLabel,
        onRemove: () => setSelectedCategory('all'),
      })
    }
    if (selectedDepartment !== 'all') {
      chips.push({
        key: 'department',
        label: '부서',
        value: selectedDepartment,
        onRemove: () => setSelectedDepartment('all'),
      })
    }
    if (showFavoritesOnly) {
      chips.push({
        key: 'favorites',
        label: '즐겨찾기',
        value: '활성',
        onRemove: () => setShowFavoritesOnly(false),
      })
    }
    if (showNewOnly) {
      chips.push({
        key: 'new-only',
        label: '신규',
        value: '활성',
        onRemove: () => setShowNewOnly(false),
      })
    }
    if (minStars > 0) {
      chips.push({
        key: 'min-stars',
        label: '최소 스타',
        value: Math.max(0, Math.floor(minStars)),
        onRemove: () => setMinStars(0),
      })
    }
    if (projectCardDensity === 'compact') {
      chips.push({
        key: 'density',
        label: '카드 밀도',
        value: '컴팩트',
        onRemove: () => setProjectCardDensity('comfortable'),
      })
    }
    return chips
  }, [
    selectedCategory,
    activeCategoryLabel,
    selectedDepartment,
    showFavoritesOnly,
    showNewOnly,
    minStars,
    projectCardDensity,
    setSelectedCategory,
    setSelectedDepartment,
    setShowFavoritesOnly,
    setShowNewOnly,
    setMinStars,
    setProjectCardDensity,
  ])

  const activeFilterCount = activeFilterChips.length

  const selectedProject = useMemo(
    () => (selectedProjectId === null ? null : projectById.get(selectedProjectId) ?? null),
    [projectById, selectedProjectId],
  )

  const selectedDiscussion = useMemo(
    () => discussions.find((discussion) => discussion.id === selectedDiscussionId) ?? null,
    [discussions, selectedDiscussionId],
  )

  const selectedDiscussionComments = useMemo(
    () => (selectedDiscussionId === null ? [] : discussionComments[selectedDiscussionId] ?? []),
    [discussionComments, selectedDiscussionId],
  )

  const relatedProjects = useMemo(() => {
    if (!selectedProject) {
      return []
    }

    const selectedTags = new Set(selectedProject.tags)
    return allProjects
      .filter((project) => project.id !== selectedProject.id)
      .map((project) => {
        let score = 0
        if (project.department === selectedProject.department) {
          score += 2
        }
        for (const tag of project.tags) {
          if (selectedTags.has(tag)) {
            score += 1
          }
        }
        if (project.trend === 'rising') {
          score += 1
        }
        return { project, score }
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || b.project.stars - a.project.stars)
      .slice(0, 4)
      .map((entry) => entry.project)
  }, [allProjects, selectedProject])

  return {
    activeCategoryLabel,
    activeDepartmentLabel,
    activeFilterChips,
    activeFilterCount,
    activeSortLabel,
    bestProjects,
    categoryCounts,
    departmentOptions,
    favoriteIdSet,
    favoriteProjects,
    recentProjects,
    relatedProjects,
    risingProjects,
    searchMatchedProjects,
    selectedDiscussion,
    selectedDiscussionComments,
    selectedProject,
    visibleProjects,
  }
}
