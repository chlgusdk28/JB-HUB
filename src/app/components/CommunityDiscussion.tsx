import { FormEvent, useMemo, useState } from 'react'
import { Eye, Flame, MessageSquare, Plus, Search, ThumbsUp } from 'lucide-react'
import {
  DISCUSSION_CATEGORIES,
  type DiscussionCategory,
  type DiscussionPost,
} from '../data/discussions'
import { PageHeader, PageShell, Pill } from './common'
import { OpalCard } from './opal/OpalCard'
import { OpalTag } from './opal/OpalTag'

interface CommunityDiscussionProps {
  discussions: DiscussionPost[]
  onDiscussionClick?: (discussionId: number) => void
  onCreateDiscussion: (input: {
    title: string
    summary: string
    category: DiscussionCategory
    tags: string[]
  }) => void
}

type DiscussionSortOption = 'latest' | 'popular'
type DiscussionDensity = 'comfortable' | 'compact'

const DISCUSSION_CATEGORY_LABELS: Record<DiscussionCategory, string> = {
  Question: '질문',
  'How-To': '가이드',
  Showcase: '사례 공유',
  Comparison: '비교',
  Announcement: '공지',
}

function getCategoryLabel(category: DiscussionCategory | 'All') {
  if (category === 'All') {
    return '전체'
  }
  return DISCUSSION_CATEGORY_LABELS[category]
}

export function CommunityDiscussion({
  discussions,
  onDiscussionClick,
  onCreateDiscussion,
}: CommunityDiscussionProps) {
  const [selectedCategory, setSelectedCategory] = useState<DiscussionCategory | 'All'>('All')
  const [keyword, setKeyword] = useState('')
  const [showComposer, setShowComposer] = useState(false)
  const [showHotOnly, setShowHotOnly] = useState(false)
  const [sortBy, setSortBy] = useState<DiscussionSortOption>('latest')
  const [discussionDensity, setDiscussionDensity] = useState<DiscussionDensity>('comfortable')

  const [titleInput, setTitleInput] = useState('')
  const [summaryInput, setSummaryInput] = useState('')
  const [categoryInput, setCategoryInput] = useState<DiscussionCategory>('Question')
  const [tagsInput, setTagsInput] = useState('')

  const filteredDiscussions = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase()
    const filtered = discussions.filter((discussion) => {
      if (selectedCategory !== 'All' && discussion.category !== selectedCategory) {
        return false
      }
      if (showHotOnly && !discussion.isHot) {
        return false
      }

      if (!normalizedKeyword) {
        return true
      }

      return (
        discussion.title.toLowerCase().includes(normalizedKeyword) ||
        discussion.summary.toLowerCase().includes(normalizedKeyword) ||
        discussion.tags.some((tag) => tag.toLowerCase().includes(normalizedKeyword))
      )
    })

    if (sortBy === 'popular') {
      return [...filtered].sort((a, b) => b.likes * 2 + b.comments * 2 + b.views / 100 - (a.likes * 2 + a.comments * 2 + a.views / 100))
    }
    return [...filtered].sort((a, b) => b.id - a.id)
  }, [discussions, keyword, selectedCategory, showHotOnly, sortBy])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const title = titleInput.trim()
    const summary = summaryInput.trim()
    if (!title || !summary) {
      return
    }

    const tags = tagsInput
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)

    onCreateDiscussion({
      title,
      summary,
      category: categoryInput,
      tags,
    })

    setTitleInput('')
    setSummaryInput('')
    setTagsInput('')
    setCategoryInput('Question')
    setShowComposer(false)
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow={
          <>
            <MessageSquare className="h-3.5 w-3.5" />
            Community Flow
          </>
        }
        title="커뮤니티"
        description="구현 노하우를 공유하고, 질문하고, 재사용 가능한 패턴을 기록하세요."
        meta={
          <>
            <Pill variant="subtle">카테고리: {getCategoryLabel(selectedCategory)}</Pill>
            <Pill variant="subtle">정렬: {sortBy === 'popular' ? '인기순' : '최신순'}</Pill>
            <Pill variant="subtle">밀도: {discussionDensity === 'compact' ? '컴팩트' : '여유'}</Pill>
            <Pill variant="subtle">결과: {filteredDiscussions.length}</Pill>
          </>
        }
      />

      <section className="surface-panel rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="action-row action-row-scroll">
            <button
              type="button"
              onClick={() => setSelectedCategory('All')}
              className={`chip-filter ${selectedCategory === 'All' ? 'chip-filter-active' : 'chip-filter-idle'}`}
            >
              전체 ({discussions.length})
            </button>
            {DISCUSSION_CATEGORIES.map((category) => {
              const count = discussions.filter((discussion) => discussion.category === category).length
              return (
                <button
                  type="button"
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`chip-filter ${selectedCategory === category ? 'chip-filter-active' : 'chip-filter-idle'}`}
                >
                  {getCategoryLabel(category)} ({count})
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => setShowHotOnly((prev) => !prev)}
              className={`chip-filter ${showHotOnly ? 'chip-filter-active' : 'chip-filter-idle'}`}
            >
              인기글만
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="제목 또는 태그 검색"
                className="w-full rounded-xl border border-slate-300 bg-white/90 py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none ring-slate-200 transition focus:border-slate-500 focus:ring-2"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowComposer((prev) => !prev)}
              className="glass-inline-button"
            >
              <Plus className="h-4 w-4" />
              새 글
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white/80 p-1">
            <button
              type="button"
              onClick={() => setSortBy('latest')}
              className={`chip-filter ${sortBy === 'latest' ? 'chip-filter-active' : 'chip-filter-idle'} !px-2.5 !py-1`}
            >
              최신순
            </button>
            <button
              type="button"
              onClick={() => setSortBy('popular')}
              className={`chip-filter ${sortBy === 'popular' ? 'chip-filter-active' : 'chip-filter-idle'} !px-2.5 !py-1`}
            >
              인기순
            </button>
          </div>
          <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white/80 p-1">
            <button
              type="button"
              onClick={() => setDiscussionDensity('comfortable')}
              className={`chip-filter ${discussionDensity === 'comfortable' ? 'chip-filter-active' : 'chip-filter-idle'} !px-2.5 !py-1`}
            >
              넓게
            </button>
            <button
              type="button"
              onClick={() => setDiscussionDensity('compact')}
              className={`chip-filter ${discussionDensity === 'compact' ? 'chip-filter-active' : 'chip-filter-idle'} !px-2.5 !py-1`}
            >
              컴팩트
            </button>
          </div>
          <span className="text-xs text-slate-500">총 {filteredDiscussions.length}개 글</span>
        </div>

        {showComposer ? (
          <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-200 pt-4 xl:grid-cols-5">
            <input
              value={titleInput}
              onChange={(event) => setTitleInput(event.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none ring-slate-200 transition focus:border-slate-500 focus:ring-2 xl:col-span-2"
              placeholder="토론 제목"
              required
            />
            <input
              value={summaryInput}
              onChange={(event) => setSummaryInput(event.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none ring-slate-200 transition focus:border-slate-500 focus:ring-2 xl:col-span-2"
              placeholder="요약"
              required
            />
            <select
              value={categoryInput}
              onChange={(event) => setCategoryInput(event.target.value as DiscussionCategory)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-slate-200 transition focus:border-slate-500 focus:ring-2"
            >
              {DISCUSSION_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {getCategoryLabel(category)}
                </option>
              ))}
            </select>
            <input
              value={tagsInput}
              onChange={(event) => setTagsInput(event.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none ring-slate-200 transition focus:border-slate-500 focus:ring-2 xl:col-span-4"
              placeholder="태그 (쉼표로 구분)"
            />
            <button
              type="submit"
              className="rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              등록
            </button>
          </form>
        ) : null}
      </section>

      <section className="space-y-4">
        {filteredDiscussions.map((discussion) => (
          <OpalCard
            key={discussion.id}
            padding={discussionDensity === 'compact' ? 'compact' : 'comfortable'}
            elevation="minimal"
            onClick={() => onDiscussionClick?.(discussion.id)}
          >
            <div className={`flex flex-col ${discussionDensity === 'compact' ? 'gap-3' : 'gap-4'} sm:flex-row sm:items-start`}>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className={`${discussionDensity === 'compact' ? 'text-base' : 'text-lg'} font-semibold text-slate-900`}>
                    {discussion.title}
                  </h3>
                  {discussion.isHot ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-100/80 px-2 py-0.5 text-xs font-semibold text-sky-700">
                      <Flame className="h-3 w-3" />
                      인기
                    </span>
                  ) : null}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                    {getCategoryLabel(discussion.category)}
                  </span>
                </div>
                <p className={`${discussionDensity === 'compact' ? 'text-xs' : 'text-sm'} text-slate-600`}>{discussion.summary}</p>
                <p className="text-xs text-slate-500">
                  {discussion.author} · {discussion.department} · {discussion.createdAt}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {discussion.tags.map((tag) => (
                    <OpalTag key={tag} size="sm" variant="primary">
                      {tag}
                    </OpalTag>
                  ))}
                </div>
              </div>

              <div className={`flex items-center text-xs text-slate-600 sm:flex-col sm:items-end ${discussionDensity === 'compact' ? 'gap-2 sm:gap-1.5' : 'gap-3 sm:gap-2'}`}>
                <span className="inline-flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5" />
                  {discussion.views}
                </span>
                <span className="inline-flex items-center gap-1">
                  <ThumbsUp className="h-3.5 w-3.5" />
                  {discussion.likes}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MessageSquare className="h-3.5 w-3.5" />
                  {discussion.comments}
                </span>
              </div>
            </div>
          </OpalCard>
        ))}

        {filteredDiscussions.length === 0 ? (
          <div className="empty-panel">
            <p className="text-sm text-slate-600">필터 조건에 맞는 토론이 없습니다.</p>
            <p className="mt-2 text-xs text-slate-500">카테고리를 전체로 바꾸거나 검색어를 줄여보세요.</p>
          </div>
        ) : null}
      </section>
    </PageShell>
  )
}
