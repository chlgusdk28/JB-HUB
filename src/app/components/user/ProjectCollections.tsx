import { useEffect, useMemo, useState } from 'react'
import { Folder, FolderPlus, Plus, Trash2, X } from 'lucide-react'
import { PageHeader, PageShell, Pill } from '../common'

interface Collection {
  id: string
  name: string
  description?: string
  color: string
  emoji?: string
  projectIds: number[]
  createdAt: string
  isPublic: boolean
}

interface Project {
  id: number
  title: string
  description: string
  department: string
  stars: number
  imageUrl?: string
}

interface ProjectCollectionsProps {
  projects: Project[]
  onProjectClick?: (projectId: number) => void
}

const STORAGE_KEY = 'jb-hub:collections'

const COLORS = [
  { name: 'Slate', value: 'bg-slate-500', light: 'bg-slate-100' },
  { name: 'Blue', value: 'bg-blue-500', light: 'bg-blue-50' },
  { name: 'Sky', value: 'bg-sky-500', light: 'bg-sky-50' },
  { name: 'Indigo', value: 'bg-indigo-500', light: 'bg-indigo-50' },
  { name: 'Teal', value: 'bg-teal-500', light: 'bg-teal-50' },
  { name: 'Cyan', value: 'bg-cyan-500', light: 'bg-cyan-50' },
] as const

const EMOJIS = ['📁', '⭐', '🚀', '💡', '🔎', '🧪', '📌', '📚', '🛠', '🎯', '🧭', '🗂']

function getDefaultCollections(): Collection[] {
  return [
    {
      id: 'favorites',
      name: '즐겨찾기 모음',
      description: '다시 보고 싶은 프로젝트를 가장 먼저 모아보는 기본 컬렉션입니다.',
      color: 'bg-slate-500',
      emoji: '⭐',
      projectIds: [],
      createdAt: new Date().toISOString(),
      isPublic: false,
    },
  ]
}

export function ProjectCollections({ projects, onProjectClick }: ProjectCollectionsProps) {
  const [collections, setCollections] = useState<Collection[]>([])
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null)
  const [showProjectPicker, setShowProjectPicker] = useState(false)

  const [newCollectionName, setNewCollectionName] = useState('')
  const [newCollectionDescription, setNewCollectionDescription] = useState('')
  const [selectedColor, setSelectedColor] = useState(COLORS[0])
  const [selectedEmoji, setSelectedEmoji] = useState(EMOJIS[0])

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) {
        setCollections(getDefaultCollections())
        return
      }

      const parsed = JSON.parse(stored) as Collection[]
      setCollections(parsed.length > 0 ? parsed : getDefaultCollections())
    } catch {
      setCollections(getDefaultCollections())
    }
  }, [])

  const selectedCollection = useMemo(
    () => collections.find((collection) => collection.id === selectedCollectionId) ?? null,
    [collections, selectedCollectionId],
  )

  const totalCollectedProjects = useMemo(
    () => collections.reduce((sum, collection) => sum + collection.projectIds.length, 0),
    [collections],
  )
  const publicCollections = useMemo(
    () => collections.filter((collection) => collection.isPublic).length,
    [collections],
  )

  const persistCollections = (nextCollections: Collection[]) => {
    setCollections(nextCollections)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextCollections))
  }

  const resetCreateForm = () => {
    setNewCollectionName('')
    setNewCollectionDescription('')
    setSelectedColor(COLORS[0])
    setSelectedEmoji(EMOJIS[0])
    setShowCreateForm(false)
  }

  const handleCreateCollection = () => {
    const normalizedName = newCollectionName.trim()
    if (!normalizedName) {
      return
    }

    const nextCollections = [
      ...collections,
      {
        id: Date.now().toString(),
        name: normalizedName,
        description: newCollectionDescription.trim() || undefined,
        color: selectedColor.value,
        emoji: selectedEmoji,
        projectIds: [],
        createdAt: new Date().toISOString(),
        isPublic: false,
      },
    ]

    persistCollections(nextCollections)
    resetCreateForm()
  }

  const handleDeleteCollection = (collectionId: string) => {
    if (!window.confirm('이 컬렉션을 삭제하시겠습니까?')) {
      return
    }

    const nextCollections = collections.filter((collection) => collection.id !== collectionId)
    persistCollections(nextCollections)

    if (selectedCollectionId === collectionId) {
      setSelectedCollectionId(null)
      setShowProjectPicker(false)
    }
  }

  const handleAddProject = (collectionId: string, projectId: number) => {
    const nextCollections = collections.map((collection) => {
      if (collection.id !== collectionId || collection.projectIds.includes(projectId)) {
        return collection
      }

      return {
        ...collection,
        projectIds: [...collection.projectIds, projectId],
      }
    })

    persistCollections(nextCollections)
    setShowProjectPicker(false)
  }

  const handleRemoveProject = (collectionId: string, projectId: number) => {
    const nextCollections = collections.map((collection) => {
      if (collection.id !== collectionId) {
        return collection
      }

      return {
        ...collection,
        projectIds: collection.projectIds.filter((id) => id !== projectId),
      }
    })

    persistCollections(nextCollections)
  }

  const getCollectionProjects = (collection: Collection) =>
    projects.filter((project) => collection.projectIds.includes(project.id))

  const availableProjects = selectedCollection
    ? projects.filter((project) => !selectedCollection.projectIds.includes(project.id))
    : []

  return (
    <PageShell density="compact">
      <PageHeader
        variant="simple"
        eyebrow={
          <>
            <Folder className="h-3.5 w-3.5" />
            Curated Sets
          </>
        }
        title="프로젝트 컬렉션"
        description="업무 목적이나 팀 관심사별로 프로젝트를 묶어서, 다시 보기 쉬운 큐레이션 보드를 만들 수 있습니다."
        meta={
          <>
            <Pill variant="subtle">컬렉션: {collections.length}</Pill>
            <Pill variant="subtle">프로젝트: {totalCollectedProjects}</Pill>
            <Pill variant="subtle">상태: {selectedCollection ? `${selectedCollection.name} 열람 중` : '목록 보기'}</Pill>
          </>
        }
      />

      <section className="page-panel space-y-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="page-summary-strip">
            <div className="page-summary-item">
              <span className="page-summary-label">컬렉션 수</span>
              <span className="page-summary-value">{collections.length}</span>
            </div>
            <div className="page-summary-item">
              <span className="page-summary-label">담긴 프로젝트</span>
              <span className="page-summary-value">{totalCollectedProjects}</span>
            </div>
            <div className="page-summary-item">
              <span className="page-summary-label">공개 컬렉션</span>
              <span className="page-summary-value">{publicCollections}</span>
            </div>
            <div className="page-summary-item">
              <span className="page-summary-label">{selectedCollection ? '추가 가능' : '전체 후보'}</span>
              <span className="page-summary-value">{selectedCollection ? availableProjects.length : projects.length}</span>
            </div>
          </div>

          <button type="button" onClick={() => setShowCreateForm((previous) => !previous)} className="glass-inline-button">
            <FolderPlus className="h-4 w-4" />
            {showCreateForm ? '작성 닫기' : '새 컬렉션'}
          </button>
        </div>

        <p className="page-toolbar-note">개인 보드처럼 프로젝트를 묶어두고, 필요한 흐름만 다시 보기 쉽게 정리할 수 있습니다.</p>
      </section>

      {showCreateForm ? (
        <section className="page-panel">
          <div className="space-y-5">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">새 컬렉션 만들기</h3>
              <p className="mt-1 text-sm text-slate-600">이름, 설명, 색상, 아이콘을 고르면 컬렉션 카드와 상세 보드에 동일한 스타일이 적용됩니다.</p>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <label className="space-y-1.5">
                <span className="field-label">이름</span>
                <input
                  type="text"
                  value={newCollectionName}
                  onChange={(event) => setNewCollectionName(event.target.value)}
                  placeholder="예: AI 레퍼런스 모음"
                  className="select-soft"
                />
              </label>

              <label className="space-y-1.5">
                <span className="field-label">설명</span>
                <input
                  type="text"
                  value={newCollectionDescription}
                  onChange={(event) => setNewCollectionDescription(event.target.value)}
                  placeholder="컬렉션의 목적을 간단히 적어 주세요."
                  className="select-soft"
                />
              </label>
            </div>

            <div className="space-y-2">
              <span className="field-label">색상</span>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    onClick={() => setSelectedColor(color)}
                    className={`h-9 w-9 rounded-2xl ${color.value} ${
                      selectedColor.value === color.value ? 'ring-2 ring-[#315779] ring-offset-2' : ''
                    }`}
                    aria-label={color.name}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <span className="field-label">아이콘</span>
              <div className="flex flex-wrap gap-2">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setSelectedEmoji(emoji)}
                    className={`flex h-11 w-11 items-center justify-center rounded-2xl text-xl transition ${
                      selectedEmoji === emoji ? 'bg-sky-100 ring-2 ring-[#315779]' : 'bg-slate-100 hover:bg-slate-200'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={resetCreateForm} className="filter-chip-clear">
                취소
              </button>
              <button
                type="button"
                onClick={handleCreateCollection}
                disabled={!newCollectionName.trim()}
                className="glass-inline-button disabled:cursor-not-allowed disabled:opacity-50"
              >
                컬렉션 만들기
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {selectedCollection ? (
        <section className="space-y-4">
          <button
            type="button"
            onClick={() => {
              setSelectedCollectionId(null)
              setShowProjectPicker(false)
            }}
            className="glass-inline-button !px-3 !py-1.5 text-xs"
          >
            목록으로 돌아가기
          </button>

          <div className="page-panel">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="flex h-14 w-14 items-center justify-center rounded-[22px] bg-slate-100 text-3xl">
                  {selectedCollection.emoji}
                </span>
                <div>
                  <h3 className="text-2xl font-semibold text-slate-900">{selectedCollection.name}</h3>
                  {selectedCollection.description ? (
                    <p className="mt-1 text-sm text-slate-500">{selectedCollection.description}</p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Pill variant="subtle">프로젝트 {selectedCollection.projectIds.length}</Pill>
                    <Pill variant="subtle">
                      생성일 {new Date(selectedCollection.createdAt).toLocaleDateString('ko-KR')}
                    </Pill>
                  </div>
                </div>
              </div>

              <div className="page-toolbar-cluster">
                <button type="button" onClick={() => setShowProjectPicker(true)} className="glass-inline-button">
                  <Plus className="h-4 w-4" />
                  프로젝트 추가
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteCollection(selectedCollection.id)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-600 transition hover:bg-rose-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {showProjectPicker ? (
              <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold text-slate-900">컬렉션에 프로젝트 추가</h4>
                  <button type="button" onClick={() => setShowProjectPicker(false)} className="glass-icon-button h-8 w-8 rounded-xl">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {availableProjects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => handleAddProject(selectedCollection.id, project.id)}
                      className="rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      <p className="font-medium text-slate-900">{project.title}</p>
                      <p className="mt-1 text-sm text-slate-500">{project.department}</p>
                    </button>
                  ))}
                  {availableProjects.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
                      추가할 수 있는 프로젝트가 없습니다.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="mt-6 page-card-grid">
              {getCollectionProjects(selectedCollection).map((project) => (
                <article
                  key={project.id}
                  className="rounded-[24px] border border-slate-200 bg-white/94 p-4 shadow-[0_10px_22px_rgba(15,23,42,0.05)]"
                >
                  <button type="button" onClick={() => onProjectClick?.(project.id)} className="block w-full text-left">
                    <p className="truncate text-base font-semibold text-slate-900">{project.title}</p>
                    <p className="mt-1 text-sm text-slate-500">{project.department}</p>
                    <p className="mt-3 text-xs text-slate-500">스타 {project.stars}</p>
                  </button>
                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleRemoveProject(selectedCollection.id, project.id)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </article>
              ))}

              {getCollectionProjects(selectedCollection).length === 0 ? (
                <div className="empty-panel md:col-span-2 2xl:col-span-3">
                  <p className="text-sm text-slate-600">아직 담긴 프로젝트가 없습니다.</p>
                  <p className="mt-2 text-xs text-slate-500">상단의 추가 버튼으로 관심 프로젝트를 모아보세요.</p>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : (
        <section className="page-card-grid">
          {collections.map((collection) => {
            const collectionProjects = getCollectionProjects(collection)
            const colorClass = COLORS.find((color) => color.value === collection.color)?.light ?? 'bg-slate-100'

            return (
              <article
                key={collection.id}
                onClick={() => setSelectedCollectionId(collection.id)}
                className="cursor-pointer overflow-hidden rounded-[24px] border border-slate-200/85 bg-white/96 shadow-[0_10px_22px_rgba(15,23,42,0.06)] transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_14px_26px_rgba(15,23,42,0.08)]"
              >
                <div className={`p-5 ${colorClass}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-3xl">{collection.emoji}</span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleDeleteCollection(collection.id)
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/80 text-slate-400 transition hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <h3 className="mt-3 text-lg font-semibold text-slate-900">{collection.name}</h3>
                  {collection.description ? (
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">{collection.description}</p>
                  ) : null}
                </div>

                <div className="space-y-3 p-5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">{collectionProjects.length}개 프로젝트</span>
                    <span className="text-slate-400">{new Date(collection.createdAt).toLocaleDateString('ko-KR')}</span>
                  </div>

                  {collectionProjects.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {collectionProjects.slice(0, 3).map((project) => (
                        <span
                          key={project.id}
                          className="max-w-[140px] truncate rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs text-slate-600"
                        >
                          {project.title}
                        </span>
                      ))}
                      {collectionProjects.length > 3 ? (
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-500">
                          +{collectionProjects.length - 3}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">아직 담긴 프로젝트가 없습니다.</p>
                  )}
                </div>
              </article>
            )
          })}
        </section>
      )}

      {collections.length === 0 && !showCreateForm ? (
        <div className="empty-panel">
          <Folder className="mx-auto mb-4 h-16 w-16 text-slate-300" />
          <p className="text-slate-500">생성된 컬렉션이 없습니다.</p>
          <p className="mt-1 text-sm text-slate-400">프로젝트를 목적별로 묶어 관리해 보세요.</p>
        </div>
      ) : null}
    </PageShell>
  )
}
