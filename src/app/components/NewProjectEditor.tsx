import { FormEvent, useMemo, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { MarkdownContent } from './common'
import type { Project } from '../lib/project-utils'

interface NewProjectEditorProps {
  onClose: () => void
  onSubmit: (projectData: Partial<Project>) => void | Promise<void>
  departmentOptions: string[]
  categoryOptions: string[]
  initialAuthor?: string
  initialDepartment?: string
}

interface FormState {
  title: string
  author: string
  department: string
  category: string
  markdown: string
  tags: string[]
}

type EditorMode = 'write' | 'preview' | 'split'

const DEFAULT_MARKDOWN = `# 프로젝트 개요

이 프로젝트가 해결하려는 문제와 핵심 가치를 2~3문장으로 적어주세요.

## 핵심 기능
- 기능 1
- 기능 2

## 기대 효과
- 업무 효율 향상
- 반복 작업 감소
`

function normalizeTag(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

export function NewProjectEditor({
  onClose,
  onSubmit,
  departmentOptions,
  categoryOptions,
  initialAuthor = '',
  initialDepartment = '',
}: NewProjectEditorProps) {
  const [form, setForm] = useState<FormState>({
    title: '',
    author: initialAuthor,
    department: initialDepartment,
    category: '',
    markdown: DEFAULT_MARKDOWN,
    tags: [],
  })
  const [currentTag, setCurrentTag] = useState('')
  const [editorMode, setEditorMode] = useState<EditorMode>('split')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const markdownRef = useRef<HTMLTextAreaElement | null>(null)

  const normalizedDepartmentOptions = useMemo(() => {
    const cleaned = departmentOptions.filter((value) => value !== 'all')
    if (initialDepartment && !cleaned.includes(initialDepartment)) {
      cleaned.unshift(initialDepartment)
    }
    if (cleaned.length > 0) {
      return cleaned
    }
    return ['IT 디지털', 'IT 플랫폼', 'IT 지원', 'IT 보안', 'AX']
  }, [departmentOptions, initialDepartment])

  const normalizedCategoryOptions = useMemo(() => {
    if (categoryOptions.length > 0) {
      return categoryOptions
    }
    return ['업무 자동화', 'AI', '문서', '협업', 'DevOps']
  }, [categoryOptions])
  const insertMarkdown = (prefix: string, suffix = '', placeholder = '') => {
    const textarea = markdownRef.current
    if (!textarea) {
      setForm((previous) => ({
        ...previous,
        markdown: `${previous.markdown}${prefix}${placeholder}${suffix}`,
      }))
      return
    }

    const selectionStart = textarea.selectionStart
    const selectionEnd = textarea.selectionEnd
    const current = form.markdown
    const selectedText = current.slice(selectionStart, selectionEnd)
    const body = selectedText || placeholder
    const inserted = `${prefix}${body}${suffix}`
    const nextMarkdown = `${current.slice(0, selectionStart)}${inserted}${current.slice(selectionEnd)}`
    const shouldSelectPlaceholder = selectedText.length === 0 && body.length > 0

    setForm((previous) => ({ ...previous, markdown: nextMarkdown }))

    requestAnimationFrame(() => {
      if (!markdownRef.current) {
        return
      }

      markdownRef.current.focus()
      if (shouldSelectPlaceholder) {
        const start = selectionStart + prefix.length
        const end = start + body.length
        markdownRef.current.setSelectionRange(start, end)
        return
      }

      const position = selectionStart + inserted.length
      markdownRef.current.setSelectionRange(position, position)
    })
  }

  const upsertTag = (rawTag: string) => {
    const normalized = normalizeTag(rawTag)
    if (!normalized) {
      return
    }

    setForm((previous) => {
      const exists = previous.tags.some((tag) => tag.toLowerCase() === normalized.toLowerCase())
      if (exists) {
        return previous
      }
      return { ...previous, tags: [...previous.tags, normalized] }
    })
  }

  const addTag = () => {
    upsertTag(currentTag)
    setCurrentTag('')
  }

  const removeTag = (target: string) => {
    setForm((previous) => ({
      ...previous,
      tags: previous.tags.filter((tag) => tag !== target),
    }))
  }

  const handleCategoryChange = (category: string) => {
    setForm((previous) => ({ ...previous, category }))
    if (category) {
      upsertTag(category)
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const title = form.title.trim()
    const author = form.author.trim()
    const department = form.department.trim()
    const description = form.markdown.trim()
    const mergedTags = [...form.tags]

    if (form.category.trim()) {
      const hasCategoryTag = mergedTags.some((tag) => tag.toLowerCase() === form.category.trim().toLowerCase())
      if (!hasCategoryTag) {
        mergedTags.push(form.category.trim())
      }
    }

    const tags = mergedTags.map(normalizeTag).filter(Boolean)
    const normalizedTags = tags.length > 0 ? tags : ['markdown']

    if (!title || !author || !department || !description) {
      setErrorMessage('프로젝트명, 작성자, 부서, 본문은 모두 입력해야 합니다.')
      return
    }
    if (title.length < 2) {
      setErrorMessage('프로젝트명은 2자 이상이어야 합니다.')
      return
    }
    if (author.length < 2) {
      setErrorMessage('작성자는 2자 이상이어야 합니다.')
      return
    }
    if (description.length < 10) {
      setErrorMessage('본문은 10자 이상이어야 합니다.')
      return
    }

    setErrorMessage(null)

    await onSubmit({
      title,
      description,
      author,
      department,
      tags: normalizedTags,
      stars: 0,
      forks: 0,
      comments: 0,
      views: 0,
      isNew: true,
      createdAt: '방금 전',
      trend: 'rising',
      badge: '신규',
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-2xl border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">새 프로젝트 에디터</h2>
            <p className="text-xs text-slate-500">마크다운으로 프로젝트 설명을 작성하고 미리보기를 확인할 수 있습니다.</p>
          </div>
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
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">프로젝트명</span>
              <input
                type="text"
                value={form.title}
                onChange={(event) => setForm((previous) => ({ ...previous, title: event.target.value }))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none ring-slate-200 transition focus:border-slate-500 focus:ring-2"
                placeholder="예: 사내 업무 자동화 허브"
                required
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">작성자</span>
              <input
                type="text"
                value={form.author}
                onChange={(event) => setForm((previous) => ({ ...previous, author: event.target.value }))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none ring-slate-200 transition focus:border-slate-500 focus:ring-2"
                placeholder="예: J. Kim"
                required
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">부서</span>
              <select
                value={form.department}
                onChange={(event) => setForm((previous) => ({ ...previous, department: event.target.value }))}
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
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">카테고리</span>
              <select
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
            </label>
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-slate-700">태그</span>
              <div className="flex flex-1 items-center gap-2">
                <input
                  type="text"
                  value={currentTag}
                  onChange={(event) => setCurrentTag(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      addTag()
                    }
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-200 transition focus:border-slate-500 focus:ring-2"
                  placeholder="태그를 입력하고 Enter"
                />
                <button
                  type="button"
                  onClick={addTag}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  <Plus className="h-4 w-4" />
                  추가
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {form.tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700"
                >
                  {tag}
                  <X className="h-3 w-3" />
                </button>
              ))}
              {form.tags.length === 0 ? <span className="text-xs text-slate-500">카테고리를 선택하거나 태그를 추가하세요.</span> : null}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-medium text-slate-700">프로젝트 설명</span>
              <div className="flex rounded-full border border-slate-200 bg-white p-1">
                {(['write', 'split', 'preview'] as EditorMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setEditorMode(mode)}
                    className={`chip-filter !px-3 !py-1 ${editorMode === mode ? 'chip-filter-active' : 'chip-filter-idle'}`}
                  >
                    {mode === 'write' ? '작성' : mode === 'split' ? '분할' : '미리보기'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => insertMarkdown('# ', '', '제목')} className="glass-inline-button !px-3 !py-1.5 text-xs">
                제목
              </button>
              <button type="button" onClick={() => insertMarkdown('## ', '', '섹션')} className="glass-inline-button !px-3 !py-1.5 text-xs">
                섹션
              </button>
              <button type="button" onClick={() => insertMarkdown('- ', '', '항목')} className="glass-inline-button !px-3 !py-1.5 text-xs">
                리스트
              </button>
              <button type="button" onClick={() => insertMarkdown('**', '**', '강조')} className="glass-inline-button !px-3 !py-1.5 text-xs">
                굵게
              </button>
              <button type="button" onClick={() => insertMarkdown('`', '`', '코드')} className="glass-inline-button !px-3 !py-1.5 text-xs">
                코드
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown('[', '](https://example.com)', '링크 텍스트')}
                className="glass-inline-button !px-3 !py-1.5 text-xs"
              >
                링크
              </button>
            </div>

            <div className={`grid gap-4 ${editorMode === 'split' ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'}`}>
              {editorMode !== 'preview' ? (
                <textarea
                  ref={markdownRef}
                  value={form.markdown}
                  onChange={(event) => setForm((previous) => ({ ...previous, markdown: event.target.value }))}
                  className="min-h-[420px] w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 font-mono text-sm text-slate-900 outline-none ring-slate-200 transition focus:border-slate-500 focus:ring-2"
                />
              ) : null}

              {editorMode !== 'write' ? (
                <div className="min-h-[420px] rounded-2xl border border-slate-200 bg-white p-5">
                  <MarkdownContent markdown={form.markdown} variant="editor" />
                </div>
              ) : null}
            </div>
          </div>

          {errorMessage ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</div>
          ) : null}

          <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              취소
            </button>
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              프로젝트 생성
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
