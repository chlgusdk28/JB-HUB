import { FormEvent, useMemo, useState } from 'react'
import { Plus, X, Package, Upload, CheckCircle2, AlertCircle, Trash2, Loader2 } from 'lucide-react'
import type { Project } from '../lib/project-utils'

interface NewProjectFormProps {
  onClose: () => void
  onSubmit: (projectData: Partial<Project>) => void
  departmentOptions: string[]
  categoryOptions: string[]
}

interface FormState {
  title: string
  description: string
  department: string
  author: string
  category: string
  tags: string[]
}

interface DockerImageInfo {
  name: string
  tags: string[]
  size: string
  sizeFormatted: string
  layers: number
  architecture: string
  loaded: boolean
  loadError?: string
}

const DEFAULT_STATE: FormState = {
  title: '',
  description: '',
  department: '',
  author: '',
  category: '',
  tags: [],
}

function normalizeTag(input: string) {
  return input.trim().replace(/\s+/g, ' ')
}

export function NewProjectForm({ onClose, onSubmit, departmentOptions, categoryOptions }: NewProjectFormProps) {
  const [form, setForm] = useState<FormState>(DEFAULT_STATE)
  const [currentTag, setCurrentTag] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [dockerEnabled, setDockerEnabled] = useState(false)
  const [dockerFile, setDockerFile] = useState<File | null>(null)
  const [dockerUploading, setDockerUploading] = useState(false)
  const [dockerImage, setDockerImage] = useState<DockerImageInfo | null>(null)
  const [dockerError, setDockerError] = useState<string | null>(null)

  const normalizedDepartmentOptions = useMemo(() => {
    const fallback = ['IT 운영', 'IT 플랫폼', 'IT 지원', 'IT 보안', 'AX']
    if (departmentOptions.length === 0) {
      return fallback
    }
    return departmentOptions.filter((value) => value !== 'all')
  }, [departmentOptions])

  const normalizedCategoryOptions = useMemo(() => {
    if (categoryOptions.length > 0) {
      return categoryOptions
    }
    return ['협업', 'AI/검색', '파일 공유', '문서', '자동화', 'DevOps', '분석', 'Docker']
  }, [categoryOptions])

  const addTag = () => {
    const normalized = normalizeTag(currentTag)
    if (!normalized) {
      return
    }

    const exists = form.tags.some((tag) => tag.toLowerCase() === normalized.toLowerCase())
    if (!exists) {
      setForm((prev) => ({ ...prev, tags: [...prev.tags, normalized] }))
    }
    setCurrentTag('')
  }

  const removeTag = (tagToRemove: string) => {
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.filter((tag) => tag !== tagToRemove),
    }))
  }

  const handleCategoryChange = (category: string) => {
    setForm((prev) => {
      const nextTags = prev.tags.some((tag) => tag.toLowerCase() === category.toLowerCase())
        ? prev.tags
        : [...prev.tags, category]
      return { ...prev, category, tags: nextTags }
    })
  }

  const handleDockerFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    if (!file.name.endsWith('.tar') && !file.name.endsWith('.tar.gz')) {
      setDockerError('Docker tar 파일(.tar, .tar.gz)만 업로드할 수 있습니다.')
      return
    }
    setDockerFile(file)
    setDockerError(null)
    setDockerImage(null)
  }

  const uploadDockerTar = async () => {
    if (!dockerFile) {
      setDockerError('파일을 먼저 선택해 주세요.')
      return
    }

    setDockerUploading(true)
    setDockerError(null)

    try {
      const formData = new FormData()
      formData.append('tarFile', dockerFile)

      const response = await fetch('/api/docker/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '업로드에 실패했습니다.')
      }

      const data = await response.json()
      setDockerImage(data.image)

      if (!form.title) {
        const imageName = data.image.name.replace(/[:/]/g, '-').split('-').pop() || data.image.name
        setForm((prev) => ({ ...prev, title: imageName }))
      }

      setForm((prev) => ({
        ...prev,
        tags: [...new Set([...prev.tags, 'Docker', 'Container', data.image.name.split(':')[0]])],
      }))
    } catch (error) {
      setDockerError(error instanceof Error ? error.message : '업로드에 실패했습니다.')
    } finally {
      setDockerUploading(false)
    }
  }

  const clearDockerFile = () => {
    setDockerFile(null)
    setDockerImage(null)
    setDockerError(null)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const title = form.title.trim()
    const description = form.description.trim()
    const author = form.author.trim()
    const department = form.department.trim()
    const tags = form.tags.map(normalizeTag).filter(Boolean)

    if (!title || !description || !author || !department) {
      setErrorMessage('필수 입력 항목을 모두 작성해 주세요.')
      return
    }

    if (tags.length === 0) {
      setErrorMessage('태그를 최소 1개 이상 추가해 주세요.')
      return
    }

    setErrorMessage(null)

    onSubmit({
      title,
      description,
      author,
      department,
      tags,
      stars: 0,
      forks: 0,
      comments: 0,
      views: 0,
      isNew: true,
      createdAt: '방금 전',
      trend: 'rising',
      badge: '신규',
      dockerImage: dockerImage || undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between rounded-t-2xl border-b border-slate-200 bg-white px-6 py-4">
          <h2 className="text-xl font-semibold text-slate-900">새 프로젝트 생성</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2">
                <Package className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Docker 이미지 포함</h3>
                <p className="text-xs text-slate-600">Docker tar 파일을 업로드해 프로젝트와 함께 등록합니다.</p>
              </div>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={dockerEnabled}
                onChange={(event) => setDockerEnabled(event.target.checked)}
                className="peer sr-only"
              />
              <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300" />
            </label>
          </div>

          {dockerEnabled ? (
            <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6">
              {!dockerImage ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-center">
                    <Package className="h-12 w-12 text-slate-400" />
                  </div>
                  <div className="text-center">
                    <h4 className="text-sm font-semibold text-slate-900">Docker 이미지 tar 파일 업로드</h4>
                    <p className="mt-1 text-xs text-slate-600">`docker save`로 만든 tar 또는 tar.gz 파일을 업로드해 주세요.</p>
                    <p className="mt-1 text-[10px] text-slate-500">예: `docker save nginx:latest -o nginx.tar`</p>
                  </div>

                  {!dockerFile ? (
                    <label className="flex cursor-pointer items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                      <Upload className="mr-2 h-4 w-4" />
                      파일 선택
                      <input type="file" accept=".tar,.tar.gz" onChange={handleDockerFileChange} className="hidden" />
                    </label>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Package className="h-5 w-5 text-blue-500" />
                          <div>
                            <p className="text-sm font-medium text-slate-900">{dockerFile.name}</p>
                            <p className="text-xs text-slate-500">{(dockerFile.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={clearDockerFile}
                          className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                          aria-label="선택한 파일 제거"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={uploadDockerTar}
                        disabled={dockerUploading}
                        className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
                      >
                        {dockerUploading ? (
                          <span className="flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            업로드 중...
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-2">
                            <Upload className="h-4 w-4" />
                            이미지 불러오기
                          </span>
                        )}
                      </button>
                    </div>
                  )}

                  {dockerError ? (
                    <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                      <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      <p>{dockerError}</p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-green-900">이미지 불러오기 완료</p>
                      <p className="text-xs text-green-700">{dockerImage.name}</p>
                    </div>
                    <button
                      type="button"
                      onClick={clearDockerFile}
                      className="rounded-lg p-2 text-green-600 transition hover:bg-green-100"
                      aria-label="불러온 이미지 지우기"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <p className="text-slate-500">크기</p>
                      <p className="font-semibold text-slate-900">{dockerImage.sizeFormatted}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <p className="text-slate-500">레이어</p>
                      <p className="font-semibold text-slate-900">{dockerImage.layers}개</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <p className="text-slate-500">아키텍처</p>
                      <p className="font-semibold text-slate-900">{dockerImage.architecture}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <p className="text-slate-500">상태</p>
                      <p className={`font-semibold ${dockerImage.loaded ? 'text-green-600' : 'text-amber-600'}`}>
                        {dockerImage.loaded ? '로드 완료' : '파일만 등록'}
                      </p>
                    </div>
                  </div>

                  {dockerImage.tags.length > 0 ? (
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <p className="mb-1 text-xs text-slate-500">태그</p>
                      <div className="flex flex-wrap gap-1">
                        {dockerImage.tags.map((tag) => (
                          <span key={tag} className="rounded border border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px] font-mono text-slate-700">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}

          <div>
            <label htmlFor="project-title" className="mb-2 block text-sm font-medium text-slate-700">
              프로젝트명 *
            </label>
            <input
              id="project-title"
              type="text"
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none ring-slate-200 transition focus:border-slate-500 focus:ring-2"
              placeholder="사내 GitLab 동기화"
              required
            />
          </div>

          <div>
            <label htmlFor="project-description" className="mb-2 block text-sm font-medium text-slate-700">
              설명 *
            </label>
            <textarea
              id="project-description"
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none ring-slate-200 transition focus:border-slate-500 focus:ring-2"
              rows={4}
              placeholder="해결하려는 문제와 기대 효과를 간단히 작성해 주세요."
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="project-author" className="mb-2 block text-sm font-medium text-slate-700">
                작성자 *
              </label>
              <input
                id="project-author"
                type="text"
                value={form.author}
                onChange={(event) => setForm((prev) => ({ ...prev, author: event.target.value }))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none ring-slate-200 transition focus:border-slate-500 focus:ring-2"
                placeholder="홍길동"
                required
              />
            </div>

            <div>
              <label htmlFor="project-department" className="mb-2 block text-sm font-medium text-slate-700">
                부서 *
              </label>
              <select
                id="project-department"
                value={form.department}
                onChange={(event) => setForm((prev) => ({ ...prev, department: event.target.value }))}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-slate-200 transition focus:border-slate-500 focus:ring-2"
                required
              >
                <option value="">부서를 선택하세요</option>
                {normalizedDepartmentOptions.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="project-category" className="mb-2 block text-sm font-medium text-slate-700">
              카테고리
            </label>
            <select
              id="project-category"
              value={form.category}
              onChange={(event) => handleCategoryChange(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-slate-200 transition focus:border-slate-500 focus:ring-2"
            >
              <option value="">카테고리를 선택하세요</option>
              {normalizedCategoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="project-tag" className="mb-2 block text-sm font-medium text-slate-700">
              태그
            </label>
            <div className="flex gap-2">
              <input
                id="project-tag"
                type="text"
                value={currentTag}
                onChange={(event) => setCurrentTag(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addTag()
                  }
                }}
                className="flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none ring-slate-200 transition focus:border-slate-500 focus:ring-2"
                placeholder="태그를 입력한 뒤 Enter"
              />
              <button
                type="button"
                onClick={addTag}
                className="rounded-xl border border-slate-300 px-3 py-2 text-slate-700 transition hover:bg-slate-100"
                aria-label="태그 추가"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {form.tags.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {form.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      aria-label={`${tag} 태그 제거`}
                      className="rounded-full p-0.5 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {errorMessage ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</div>
          ) : null}

          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 sm:w-auto"
            >
              취소
            </button>
            <button
              type="submit"
              className="w-full rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 sm:w-auto"
            >
              프로젝트 생성
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
