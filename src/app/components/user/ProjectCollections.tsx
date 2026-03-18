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

const EMOJIS = ['📁', '🗂️', '🚀', '⭐', '🧪', '📊', '🛠️', '💡', '📚', '🎯', '🔍', '🤝']

function getDefaultCollections(): Collection[] {
  return [
    {
      id: 'favorites',
      name: '즐겨찾기 보관함',
      description: '다시 보고 싶은 프로젝트를 모아두는 기본 컬렉션',
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
    if (!confirm('이 컬렉션을 삭제하시겠습니까?')) {
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
        eyebrow={
          <>
            <Folder className="h-3.5 w-3.5" />
            Curated Sets
          </>
        }
        title="프로젝트 컬렉션"
        description="업무 목적이나 팀 단위로 프로젝트를 묶어서 다시 보기 쉬운 보관함을 만들 수 있습니다."
        meta={
          <>
            <Pill variant="subtle">컬렉션: {collections.length}</Pill>
            <Pill variant="subtle">
              상태: {selectedCollection ? `${selectedCollection.name} 열람 중` : '목록 보기'}
            </Pill>
          </>
        }
      />

      <section className="page-panel flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Folder className="h-5 w-5 text-slate-700" />
          <h2 className="text-lg font-semibold text-slate-900">컬렉션 관리</h2>
          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-sm text-slate-600">
            {collections.length}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateForm((previous) => !previous)}
          className="inline-flex items-center gap-2 rounded-xl border border-[#264969] bg-[#264969] px-4 py-2 text-sm font-semibold text-white transition-colors hover:border-[#1f3e5a] hover:bg-[#1f3e5a]"
        >
          <FolderPlus className="h-4 w-4" />
          새 컬렉션
        </button>
      </section>

      {showCreateForm ? (
        <section className="page-panel-lg">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">새 컬렉션 만들기</h3>
              <p className="mt-1 text-sm text-slate-600">이름, 설명, 색상, 아이콘을 선택해 컬렉션을 생성합니다.</p>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <label className="space-y-1">
                <span className="field-label">이름</span>
                <input
                  type="text"
                  value={newCollectionName}
                  onChange={(event) => setNewCollectionName(event.target.value)}
                  placeholder="예: 프런트엔드 참고 자료"
                  className="select-soft"
                />
              </label>

              <label className="space-y-1">
                <span className="field-label">설명</span>
                <input
                  type="text"
                  value={newCollectionDescription}
                  onChange={(event) => setNewCollectionDescription(event.target.value)}
                  placeholder="컬렉션 목적을 간단히 적어주세요"
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
                    className={`h-8 w-8 rounded-lg ${color.value} ${
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
                    className={`flex h-10 w-10 items-center justify-center rounded-lg text-xl ${
                      selectedEmoji === emoji ? 'bg-sky-100 ring-2 ring-[#315779]' : 'bg-slate-100'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={resetCreateForm}
                className="rounded-xl border border-slate-300 px-4 py-2 text-slate-700 transition-colors hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleCreateCollection}
                disabled={!newCollectionName.trim()}
                className="rounded-xl border border-[#264969] bg-[#264969] px-4 py-2 text-white transition-colors hover:border-[#1f3e5a] hover:bg-[#1f3e5a] disabled:opacity-50"
              >
                만들기
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

          <div className="page-panel-lg">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="text-4xl">{selectedCollection.emoji}</span>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">{selectedCollection.name}</h3>
                  {selectedCollection.description ? (
                    <p className="mt-1 text-sm text-slate-500">{selectedCollection.description}</p>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowProjectPicker(true)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <Plus className="h-4 w-4" />
                  프로젝트 추가
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteCollection(selectedCollection.id)}
                  className="rounded-lg p-2 text-slate-400 transition-colors hover:text-rose-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {showProjectPicker ? (
              <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold text-slate-900">컬렉션에 프로젝트 추가</h4>
                  <button type="button" onClick={() => setShowProjectPicker(false)} className="text-slate-400 hover:text-slate-700">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {availableProjects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => handleAddProject(selectedCollection.id, project.id)}
                      className="rounded-xl border border-slate-200 bg-white p-3 text-left transition-colors hover:bg-slate-50"
                    >
                      <p className="font-medium text-slate-900">{project.title}</p>
                      <p className="mt-1 text-sm text-slate-500">{project.department}</p>
                    </button>
                  ))}
                  {availableProjects.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
                      추가할 수 있는 프로젝트가 없습니다.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {getCollectionProjects(selectedCollection).map((project) => (
                <article
                  key={project.id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:bg-slate-50"
                >
                  <button
                    type="button"
                    onClick={() => onProjectClick?.(project.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate font-medium text-slate-900">{project.title}</p>
                    <p className="mt-1 text-sm text-slate-500">{project.department}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveProject(selectedCollection.id, project.id)}
                    className="rounded-lg p-2 text-slate-400 transition-colors hover:text-rose-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </article>
              ))}

              {getCollectionProjects(selectedCollection).length === 0 ? (
                <div className="empty-panel md:col-span-2">
                  <p className="text-sm text-slate-600">아직 담긴 프로젝트가 없습니다.</p>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {collections.map((collection) => {
            const collectionProjects = getCollectionProjects(collection)
            const colorClass = COLORS.find((color) => color.value === collection.color)?.light ?? 'bg-slate-100'

            return (
              <article
                key={collection.id}
                onClick={() => setSelectedCollectionId(collection.id)}
                className="cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white transition-[box-shadow,border-color] hover:border-slate-300 hover:shadow-sm"
              >
                <div className={`p-4 ${colorClass}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-3xl">{collection.emoji}</span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleDeleteCollection(collection.id)
                      }}
                      className="rounded-lg p-1 text-slate-400 transition-colors hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <h3 className="mt-2 font-bold text-slate-900">{collection.name}</h3>
                  {collection.description ? (
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">{collection.description}</p>
                  ) : null}
                </div>

                <div className="p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">{collectionProjects.length}개 프로젝트</span>
                    <span className="text-slate-400">{new Date(collection.createdAt).toLocaleDateString('ko-KR')}</span>
                  </div>

                  {collectionProjects.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {collectionProjects.slice(0, 3).map((project) => (
                        <span
                          key={project.id}
                          className="max-w-[120px] truncate rounded border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-600"
                        >
                          {project.title}
                        </span>
                      ))}
                      {collectionProjects.length > 3 ? (
                        <span className="px-2 py-1 text-xs text-slate-500">+{collectionProjects.length - 3}</span>
                      ) : null}
                    </div>
                  ) : null}
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
          <p className="mt-1 text-sm text-slate-400">프로젝트를 목적별로 묶어서 관리해 보세요.</p>
        </div>
      ) : null}
    </PageShell>
  )
}
