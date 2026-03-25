import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bookmark,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CirclePlus,
  Download,
  Edit3,
  Eye,
  Filter,
  Link2,
  MessageCircleMore,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  ThumbsUp,
  Trash2,
  User,
} from 'lucide-react'
import { PageHeader, PageShell, Pill } from './common'
import { OpalButton } from './opal/OpalButton'
import { OpalCard } from './opal/OpalCard'
import { OpalTag } from './opal/OpalTag'
import { usePersistentState } from '../hooks/usePersistentState'
import { copyTextToClipboard } from '../lib/clipboard'
import { useToast } from './ToastProvider'
import { exportToCSV, exportToJSON } from '../lib/export'

type KnowledgeCategory = '개발' | '인프라' | '업무자동화' | '보안' | '데이터' | '기타'
type KnowledgeStatusFilter = 'all' | 'open' | 'resolved' | 'unanswered'
type KnowledgeSortOption = 'latest' | 'oldest' | 'votes' | 'views' | 'answers' | 'activity'
type KnowledgeCardDensity = 'comfortable' | 'compact'

interface KnowledgeAnswer {
  id: number
  author: string
  department: string
  content: string
  helpful: number
  isAccepted: boolean
  createdAt: string
  editedAt?: string
}

interface KnowledgeQuestion {
  id: number
  title: string
  content: string
  category: KnowledgeCategory
  tags: string[]
  author: string
  department: string
  votes: number
  views: number
  createdAt: string
  updatedAt: string
  answers: KnowledgeAnswer[]
}

interface ComposerDraft {
  title: string
  content: string
  category: KnowledgeCategory
  tags: string
}

const CURRENT_USER = {
  name: '현재 사용자',
  department: '질문자',
}

const CATEGORY_OPTIONS: Array<KnowledgeCategory | '전체'> = ['전체', '개발', '인프라', '업무자동화', '보안', '데이터', '기타']

const SORT_LABELS: Record<KnowledgeSortOption, string> = {
  latest: '최신순',
  oldest: '오래된순',
  votes: '추천순',
  views: '조회순',
  answers: '답변순',
  activity: '활동순',
}

const DEFAULT_COMPOSER_DRAFT: ComposerDraft = {
  title: '',
  content: '',
  category: '개발',
  tags: '',
}

const INITIAL_QUESTIONS: KnowledgeQuestion[] = [
  {
    id: 1,
    title: '사내 React 앱 성능 측정할 때 우선순위를 어떻게 잡아야 하나요?',
    content:
      '프로젝트가 커지면서 렌더링이 느려졌습니다. 번들, 렌더링, API 병목 중 어디부터 점검해야 효율적일지 조언 부탁드립니다.',
    category: '개발',
    tags: ['React', '성능', '번들'],
    author: '김소연',
    department: '플랫폼개발팀',
    votes: 12,
    views: 184,
    createdAt: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 32).toISOString(),
    answers: [
      {
        id: 11,
        author: '박준호',
        department: '프론트엔드개발팀',
        content:
          '1) Lighthouse/Profiler로 병목 지점 확인 2) route-level code splitting 3) 비싼 컴포넌트부터 memo/useMemo 적용 순서를 추천합니다.',
        helpful: 9,
        isAccepted: true,
        createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      },
    ],
  },
  {
    id: 2,
    title: 'CI 파이프라인에서 Docker 이미지 캐시 전략이 궁금합니다.',
    content:
      '빌드 시간이 길어지고 있습니다. GitHub Actions 환경에서 캐시 히트율을 높이는 실전 패턴이 있을까요?',
    category: '인프라',
    tags: ['CI/CD', 'Docker', '캐시'],
    author: '이정민',
    department: 'DevOps팀',
    votes: 8,
    views: 126,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    answers: [],
  },
  {
    id: 3,
    title: '업무 자동화 봇에서 개인정보 마스킹을 어떻게 처리하시나요?',
    content:
      '사내 메신저 알림 봇을 만들고 있는데 로그와 메시지에서 개인정보를 안전하게 다루는 가이드가 필요합니다.',
    category: '보안',
    tags: ['보안', '자동화', '컴플라이언스'],
    author: '최유리',
    department: '업무혁신팀',
    votes: 15,
    views: 210,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 10).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 9).toISOString(),
    answers: [
      {
        id: 31,
        author: '장민석',
        department: '보안팀',
        content:
          '수집 단계에서 정규식 기반 마스킹 + 저장 전 토큰화 + 접근 로그 감사 정책을 함께 적용하면 운영 안정성이 높습니다.',
        helpful: 14,
        isAccepted: false,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 9).toISOString(),
      },
    ],
  },
]

function isResolved(question: KnowledgeQuestion) {
  return question.answers.some((answer) => answer.isAccepted)
}

function parseDateValue(input: string) {
  const parsed = Date.parse(input)
  if (Number.isNaN(parsed)) {
    return 0
  }
  return parsed
}

function formatRelativeTime(input: string) {
  const diffMs = Date.now() - parseDateValue(input)
  const minute = 1000 * 60
  const hour = minute * 60
  const day = hour * 24

  if (diffMs < hour) {
    return `${Math.max(1, Math.floor(diffMs / minute))}분 전`
  }
  if (diffMs < day) {
    return `${Math.floor(diffMs / hour)}시간 전`
  }
  return `${Math.floor(diffMs / day)}일 전`
}

function normalizeTags(value: string) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag, index, tags) => tags.indexOf(tag) === index)
}

function toAnswerKey(questionId: number, answerId: number) {
  return `${questionId}:${answerId}`
}

function toQuestionHash(questionId: number) {
  return `knowledge-${questionId}`
}

function toQuestionShareUrl(questionId: number) {
  if (typeof window === 'undefined') {
    return ''
  }
  return `${window.location.origin}${window.location.pathname}${window.location.search}#${toQuestionHash(questionId)}`
}

async function copyToClipboard(text: string) {
  const copied = await copyTextToClipboard(text)
  if (!copied) {
    throw new Error('clipboard-unavailable')
  }
}

export function KnowledgeHubPage() {
  const { success, info, warning, error } = useToast()

  const [questions, setQuestions] = usePersistentState<KnowledgeQuestion[]>('jb-hub:knowledge:questions', INITIAL_QUESTIONS)
  const [searchQuery, setSearchQuery] = usePersistentState<string>('jb-hub:knowledge:search', '')
  const [selectedCategory, setSelectedCategory] = usePersistentState<KnowledgeCategory | '전체'>(
    'jb-hub:knowledge:category',
    '전체',
  )
  const [selectedStatus, setSelectedStatus] = usePersistentState<KnowledgeStatusFilter>('jb-hub:knowledge:status', 'all')
  const [sortBy, setSortBy] = usePersistentState<KnowledgeSortOption>('jb-hub:knowledge:sort', 'activity')
  const [selectedTag, setSelectedTag] = usePersistentState<string>('jb-hub:knowledge:tag', 'all')
  const [showBookmarkedOnly, setShowBookmarkedOnly] = usePersistentState<boolean>('jb-hub:knowledge:bookmarked-only', false)
  const [showMineOnly, setShowMineOnly] = usePersistentState<boolean>('jb-hub:knowledge:mine-only', false)
  const [density, setDensity] = usePersistentState<KnowledgeCardDensity>('jb-hub:knowledge:density', 'comfortable')

  const [bookmarkedQuestionIds, setBookmarkedQuestionIds] = usePersistentState<number[]>('jb-hub:knowledge:bookmarks', [])
  const [questionVoteIds, setQuestionVoteIds] = usePersistentState<number[]>('jb-hub:knowledge:question-votes', [])
  const [helpfulVoteKeys, setHelpfulVoteKeys] = usePersistentState<string[]>('jb-hub:knowledge:helpful-votes', [])
  const [expandedQuestionId, setExpandedQuestionId] = usePersistentState<number | null>('jb-hub:knowledge:expanded-question', null)

  const [showComposer, setShowComposer] = useState(false)
  const [composerDraft, setComposerDraft] = usePersistentState<ComposerDraft>(
    'jb-hub:knowledge:composer-draft',
    DEFAULT_COMPOSER_DRAFT,
  )
  const [answerDrafts, setAnswerDrafts] = usePersistentState<Record<string, string>>('jb-hub:knowledge:answer-drafts', {})

  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null)
  const [editingQuestionDraft, setEditingQuestionDraft] = useState<ComposerDraft>(DEFAULT_COMPOSER_DRAFT)

  const [editingAnswerKey, setEditingAnswerKey] = useState<string | null>(null)
  const [editingAnswerContent, setEditingAnswerContent] = useState('')

  const [highlightQuestionId, setHighlightQuestionId] = useState<number | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const viewedInSessionRef = useRef<Set<number>>(new Set())

  const bookmarkedQuestionIdSet = useMemo(() => new Set(bookmarkedQuestionIds), [bookmarkedQuestionIds])
  const questionVoteIdSet = useMemo(() => new Set(questionVoteIds), [questionVoteIds])
  const helpfulVoteKeySet = useMemo(() => new Set(helpfulVoteKeys), [helpfulVoteKeys])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const openCount = questions.filter((question) => !isResolved(question)).length
    window.dispatchEvent(
      new CustomEvent('jb-hub:knowledge-updated', {
        detail: {
          openCount,
          total: questions.length,
        },
      }),
    )
  }, [questions])

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tagName = target?.tagName ?? ''
      const isTypingTarget = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName) || Boolean(target?.isContentEditable)

      if (event.key === '/' && !isTypingTarget) {
        event.preventDefault()
        searchInputRef.current?.focus()
      }

      if ((event.key === 'n' || event.key === 'N') && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setShowComposer(true)
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [])

  useEffect(() => {
    const openQuestionFromHash = () => {
      if (typeof window === 'undefined') {
        return
      }

      const hash = window.location.hash.replace('#', '')
      if (!hash.startsWith('knowledge-')) {
        return
      }

      const questionId = Number.parseInt(hash.replace('knowledge-', ''), 10)
      if (Number.isNaN(questionId)) {
        return
      }

      if (!questions.some((question) => question.id === questionId)) {
        return
      }

      setExpandedQuestionId(questionId)
      setHighlightQuestionId(questionId)
      window.setTimeout(() => setHighlightQuestionId(null), 1800)
    }

    openQuestionFromHash()
    window.addEventListener('hashchange', openQuestionFromHash)
    return () => window.removeEventListener('hashchange', openQuestionFromHash)
  }, [questions, setExpandedQuestionId])

  const availableTagCounts = useMemo(() => {
    const counts = new Map<string, number>()

    questions.forEach((question) => {
      question.tags.forEach((tag) => {
        counts.set(tag, (counts.get(tag) ?? 0) + 1)
      })
    })

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 16)
  }, [questions])

  const categoryCounts = useMemo(() => {
    const base = Object.fromEntries(CATEGORY_OPTIONS.map((category) => [category, 0])) as Record<KnowledgeCategory | '전체', number>
    base['전체'] = questions.length

    questions.forEach((question) => {
      base[question.category] += 1
    })

    return base
  }, [questions])

  const filteredQuestions = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()

    const scoped = questions.filter((question) => {
      if (selectedCategory !== '전체' && question.category !== selectedCategory) {
        return false
      }

      const resolved = isResolved(question)
      if (selectedStatus === 'open' && resolved) {
        return false
      }
      if (selectedStatus === 'resolved' && !resolved) {
        return false
      }
      if (selectedStatus === 'unanswered' && question.answers.length > 0) {
        return false
      }

      if (selectedTag !== 'all' && !question.tags.includes(selectedTag)) {
        return false
      }
      if (showBookmarkedOnly && !bookmarkedQuestionIdSet.has(question.id)) {
        return false
      }
      if (showMineOnly && question.author !== CURRENT_USER.name) {
        return false
      }

      if (!normalizedQuery) {
        return true
      }

      return (
        question.title.toLowerCase().includes(normalizedQuery) ||
        question.content.toLowerCase().includes(normalizedQuery) ||
        question.author.toLowerCase().includes(normalizedQuery) ||
        question.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery))
      )
    })

    const sorted = [...scoped]

    switch (sortBy) {
      case 'latest':
        sorted.sort((a, b) => parseDateValue(b.createdAt) - parseDateValue(a.createdAt))
        break
      case 'oldest':
        sorted.sort((a, b) => parseDateValue(a.createdAt) - parseDateValue(b.createdAt))
        break
      case 'votes':
        sorted.sort((a, b) => b.votes - a.votes || parseDateValue(b.updatedAt) - parseDateValue(a.updatedAt))
        break
      case 'views':
        sorted.sort((a, b) => b.views - a.views || parseDateValue(b.updatedAt) - parseDateValue(a.updatedAt))
        break
      case 'answers':
        sorted.sort((a, b) => b.answers.length - a.answers.length || parseDateValue(b.updatedAt) - parseDateValue(a.updatedAt))
        break
      case 'activity':
      default:
        sorted.sort((a, b) => parseDateValue(b.updatedAt) - parseDateValue(a.updatedAt))
        break
    }

    return sorted
  }, [
    questions,
    searchQuery,
    selectedCategory,
    selectedStatus,
    selectedTag,
    showBookmarkedOnly,
    showMineOnly,
    bookmarkedQuestionIdSet,
    sortBy,
  ])

  const summary = useMemo(() => {
    const resolvedCount = questions.filter((question) => isResolved(question)).length
    const answerCount = questions.reduce((acc, question) => acc + question.answers.length, 0)

    const responseDurations = questions
      .map((question) => {
        if (question.answers.length === 0) {
          return null
        }

        const firstAnswer = [...question.answers].sort((a, b) => parseDateValue(a.createdAt) - parseDateValue(b.createdAt))[0]
        if (!firstAnswer) {
          return null
        }

        const duration = parseDateValue(firstAnswer.createdAt) - parseDateValue(question.createdAt)
        return duration > 0 ? duration : null
      })
      .filter((duration): duration is number => duration !== null)

    const averageFirstResponseMinutes =
      responseDurations.length > 0
        ? Math.round(responseDurations.reduce((acc, duration) => acc + duration, 0) / responseDurations.length / (1000 * 60))
        : null

    return {
      total: questions.length,
      resolved: resolvedCount,
      unresolved: questions.length - resolvedCount,
      answers: answerCount,
      resolutionRate: questions.length > 0 ? Math.round((resolvedCount / questions.length) * 100) : 0,
      averageFirstResponseMinutes,
      myQuestions: questions.filter((question) => question.author === CURRENT_USER.name).length,
      bookmarked: bookmarkedQuestionIds.length,
    }
  }, [questions, bookmarkedQuestionIds.length])

  const activeFilterCount =
    (selectedCategory !== '전체' ? 1 : 0) +
    (selectedStatus !== 'all' ? 1 : 0) +
    (selectedTag !== 'all' ? 1 : 0) +
    (showBookmarkedOnly ? 1 : 0) +
    (showMineOnly ? 1 : 0) +
    (searchQuery.trim() ? 1 : 0)

  const resetFilters = () => {
    setSearchQuery('')
    setSelectedCategory('전체')
    setSelectedStatus('all')
    setSelectedTag('all')
    setShowBookmarkedOnly(false)
    setShowMineOnly(false)
    setSortBy('activity')
    setDensity('comfortable')
    info('지식인 필터를 초기화했습니다.')
  }

  const handleCreateQuestion = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const normalizedTitle = composerDraft.title.trim()
    const normalizedContent = composerDraft.content.trim()
    if (!normalizedTitle || !normalizedContent) {
      warning('제목과 내용을 입력해 주세요.')
      return
    }

    const createdAt = new Date().toISOString()
    const newQuestion: KnowledgeQuestion = {
      id: Date.now(),
      title: normalizedTitle,
      content: normalizedContent,
      category: composerDraft.category,
      tags: normalizeTags(composerDraft.tags),
      author: CURRENT_USER.name,
      department: CURRENT_USER.department,
      votes: 0,
      views: 0,
      createdAt,
      updatedAt: createdAt,
      answers: [],
    }

    setQuestions((prev) => [newQuestion, ...prev])
    setExpandedQuestionId(newQuestion.id)
    setShowComposer(false)
    setComposerDraft(DEFAULT_COMPOSER_DRAFT)

    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${toQuestionHash(newQuestion.id)}`)
    }

    success('새 질문을 등록했습니다.')
  }

  const handleStartQuestionEdit = (question: KnowledgeQuestion) => {
    if (question.author !== CURRENT_USER.name) {
      warning('본인이 작성한 질문만 수정할 수 있습니다.')
      return
    }

    setEditingQuestionId(question.id)
    setEditingQuestionDraft({
      title: question.title,
      content: question.content,
      category: question.category,
      tags: question.tags.join(', '),
    })
  }

  const handleSaveQuestionEdit = (questionId: number) => {
    const normalizedTitle = editingQuestionDraft.title.trim()
    const normalizedContent = editingQuestionDraft.content.trim()
    if (!normalizedTitle || !normalizedContent) {
      warning('제목과 내용을 입력해 주세요.')
      return
    }

    setQuestions((prev) =>
      prev.map((question) =>
        question.id === questionId
          ? {
              ...question,
              title: normalizedTitle,
              content: normalizedContent,
              category: editingQuestionDraft.category,
              tags: normalizeTags(editingQuestionDraft.tags),
              updatedAt: new Date().toISOString(),
            }
          : question,
      ),
    )

    setEditingQuestionId(null)
    setEditingQuestionDraft(DEFAULT_COMPOSER_DRAFT)
    success('질문을 수정했습니다.')
  }

  const handleDeleteQuestion = (question: KnowledgeQuestion) => {
    if (question.author !== CURRENT_USER.name) {
      warning('본인이 작성한 질문만 삭제할 수 있습니다.')
      return
    }

    const confirmed = window.confirm('질문을 삭제하시겠습니까? 답변도 함께 삭제됩니다.')
    if (!confirmed) {
      return
    }

    setQuestions((prev) => prev.filter((item) => item.id !== question.id))
    setBookmarkedQuestionIds((prev) => prev.filter((id) => id !== question.id))
    setQuestionVoteIds((prev) => prev.filter((id) => id !== question.id))
    setHelpfulVoteKeys((prev) => prev.filter((key) => !key.startsWith(`${question.id}:`)))
    setAnswerDrafts((prev) => {
      const next = { ...prev }
      delete next[String(question.id)]
      return next
    })

    if (expandedQuestionId === question.id) {
      setExpandedQuestionId(null)
    }

    setEditingQuestionId((prev) => (prev === question.id ? null : prev))
    info('질문을 삭제했습니다.')
  }

  const handleToggleQuestionVote = (questionId: number) => {
    const alreadyVoted = questionVoteIdSet.has(questionId)

    setQuestions((prev) =>
      prev.map((question) =>
        question.id === questionId
          ? {
              ...question,
              votes: alreadyVoted ? Math.max(0, question.votes - 1) : question.votes + 1,
              updatedAt: new Date().toISOString(),
            }
          : question,
      ),
    )

    setQuestionVoteIds((prev) =>
      alreadyVoted ? prev.filter((id) => id !== questionId) : [...prev, questionId],
    )
  }

  const handleToggleBookmark = (questionId: number) => {
    const alreadyBookmarked = bookmarkedQuestionIdSet.has(questionId)

    setBookmarkedQuestionIds((prev) =>
      alreadyBookmarked ? prev.filter((id) => id !== questionId) : [...prev, questionId],
    )

    info(alreadyBookmarked ? '북마크에서 제거했습니다.' : '북마크에 저장했습니다.')
  }

  const handleShareQuestion = async (questionId: number) => {
    const url = toQuestionShareUrl(questionId)
    if (!url) {
      return
    }

    try {
      await copyToClipboard(url)
      success('질문 링크를 복사했습니다.')
    } catch {
      error('링크 복사에 실패했습니다. 수동으로 복사해 주세요.')
    }
  }

  const handleToggleExpanded = (questionId: number) => {
    const isOpening = expandedQuestionId !== questionId
    setExpandedQuestionId(isOpening ? questionId : null)

    if (typeof window !== 'undefined') {
      if (isOpening) {
        window.history.replaceState(null, '', `#${toQuestionHash(questionId)}`)
      } else {
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      }
    }

    if (isOpening && !viewedInSessionRef.current.has(questionId)) {
      viewedInSessionRef.current.add(questionId)
      setQuestions((prev) =>
        prev.map((question) =>
          question.id === questionId
            ? { ...question, views: question.views + 1, updatedAt: new Date().toISOString() }
            : question,
        ),
      )
    }
  }

  const handleAddAnswer = (questionId: number) => {
    const draft = (answerDrafts[String(questionId)] ?? '').trim()
    if (!draft) {
      warning('답변 내용을 입력해 주세요.')
      return
    }

    const newAnswer: KnowledgeAnswer = {
      id: Date.now(),
      author: CURRENT_USER.name,
      department: CURRENT_USER.department,
      content: draft,
      helpful: 0,
      isAccepted: false,
      createdAt: new Date().toISOString(),
    }

    setQuestions((prev) =>
      prev.map((question) =>
        question.id === questionId
          ? {
              ...question,
              answers: [...question.answers, newAnswer],
              updatedAt: new Date().toISOString(),
            }
          : question,
      ),
    )

    setAnswerDrafts((prev) => ({
      ...prev,
      [String(questionId)]: '',
    }))

    success('답변을 등록했습니다.')
  }

  const handleToggleAnswerAccepted = (questionId: number, answerId: number) => {
    const targetQuestion = questions.find((question) => question.id === questionId)
    if (!targetQuestion) {
      return
    }

    if (targetQuestion.author !== CURRENT_USER.name) {
      warning('질문 작성자만 채택 상태를 변경할 수 있습니다.')
      return
    }

    const currentlyAccepted = targetQuestion.answers.find((answer) => answer.id === answerId)?.isAccepted ?? false

    setQuestions((prev) =>
      prev.map((question) => {
        if (question.id !== questionId) {
          return question
        }

        return {
          ...question,
          answers: question.answers.map((answer) => ({
            ...answer,
            isAccepted: currentlyAccepted ? false : answer.id === answerId,
          })),
          updatedAt: new Date().toISOString(),
        }
      }),
    )

    success(currentlyAccepted ? '채택을 해제했습니다.' : '답변을 채택했습니다.')
  }

  const handleToggleHelpful = (questionId: number, answerId: number) => {
    const key = toAnswerKey(questionId, answerId)
    const alreadyMarked = helpfulVoteKeySet.has(key)

    setQuestions((prev) =>
      prev.map((question) => {
        if (question.id !== questionId) {
          return question
        }

        return {
          ...question,
          answers: question.answers.map((answer) =>
            answer.id === answerId
              ? {
                  ...answer,
                  helpful: alreadyMarked ? Math.max(0, answer.helpful - 1) : answer.helpful + 1,
                }
              : answer,
          ),
          updatedAt: new Date().toISOString(),
        }
      }),
    )

    setHelpfulVoteKeys((prev) =>
      alreadyMarked ? prev.filter((value) => value !== key) : [...prev, key],
    )
  }

  const handleStartAnswerEdit = (questionId: number, answer: KnowledgeAnswer) => {
    if (answer.author !== CURRENT_USER.name) {
      warning('본인이 작성한 답변만 수정할 수 있습니다.')
      return
    }

    const key = toAnswerKey(questionId, answer.id)
    setEditingAnswerKey(key)
    setEditingAnswerContent(answer.content)
  }

  const handleSaveAnswerEdit = (questionId: number, answerId: number) => {
    const normalized = editingAnswerContent.trim()
    if (!normalized) {
      warning('답변 내용을 입력해 주세요.')
      return
    }

    setQuestions((prev) =>
      prev.map((question) => {
        if (question.id !== questionId) {
          return question
        }

        return {
          ...question,
          answers: question.answers.map((answer) =>
            answer.id === answerId
              ? {
                  ...answer,
                  content: normalized,
                  editedAt: new Date().toISOString(),
                }
              : answer,
          ),
          updatedAt: new Date().toISOString(),
        }
      }),
    )

    setEditingAnswerKey(null)
    setEditingAnswerContent('')
    success('답변을 수정했습니다.')
  }

  const handleDeleteAnswer = (questionId: number, answer: KnowledgeAnswer) => {
    if (answer.author !== CURRENT_USER.name) {
      warning('본인이 작성한 답변만 삭제할 수 있습니다.')
      return
    }

    const confirmed = window.confirm('답변을 삭제하시겠습니까?')
    if (!confirmed) {
      return
    }

    setQuestions((prev) =>
      prev.map((question) =>
        question.id === questionId
          ? {
              ...question,
              answers: question.answers.filter((item) => item.id !== answer.id),
              updatedAt: new Date().toISOString(),
            }
          : question,
      ),
    )

    const key = toAnswerKey(questionId, answer.id)
    setHelpfulVoteKeys((prev) => prev.filter((value) => value !== key))

    if (editingAnswerKey === key) {
      setEditingAnswerKey(null)
      setEditingAnswerContent('')
    }

    info('답변을 삭제했습니다.')
  }

  const handleExport = (format: 'csv' | 'json') => {
    const rows = filteredQuestions.map((question) => ({
      id: question.id,
      title: question.title,
      category: question.category,
      status: isResolved(question) ? 'resolved' : 'open',
      votes: question.votes,
      views: question.views,
      answers: question.answers.length,
      tags: question.tags.join(', '),
      author: question.author,
      department: question.department,
      created_at: question.createdAt,
      updated_at: question.updatedAt,
    }))

    try {
      const stamp = new Date().toISOString().slice(0, 10)
      if (format === 'csv') {
        exportToCSV(rows, `knowledge-hub-${stamp}.csv`)
      } else {
        exportToJSON(rows, `knowledge-hub-${stamp}.json`)
      }
      success(`질문 목록을 ${format.toUpperCase()}로 내보냈습니다.`)
    } catch (exportError) {
      const message = exportError instanceof Error ? exportError.message : '내보내기에 실패했습니다.'
      error(message)
    }
  }

  return (
    <PageShell density="compact">
      <PageHeader
        variant="simple"
        eyebrow="Knowledge Hub"
        title="지식인"
        description="팀의 궁금증을 해결하는 실전 Q&A 허브입니다. 질문, 채택, 북마크, 공유, 내보내기까지 같은 화면 흐름 안에서 관리할 수 있습니다."
        actions={
          <>
            <OpalButton variant="primary" size="sm" icon={<CirclePlus className="h-4 w-4" />} onClick={() => setShowComposer(true)}>
              새 질문 작성
            </OpalButton>
            <OpalButton variant="secondary" size="sm" icon={<Download className="h-4 w-4" />} onClick={() => handleExport('json')}>
              JSON 내보내기
            </OpalButton>
            <OpalButton variant="secondary" size="sm" icon={<Download className="h-4 w-4" />} onClick={() => handleExport('csv')}>
              CSV 내보내기
            </OpalButton>
            <OpalButton variant="secondary" size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={resetFilters}>
              필터 초기화
            </OpalButton>
          </>
        }
      />

      <section className="page-panel space-y-4 knowledge-command-deck">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="page-summary-strip">
            <div className="page-summary-item">
              <span className="page-summary-label">전체 질문</span>
              <span className="page-summary-value">{summary.total}</span>
            </div>
            <div className="page-summary-item">
              <span className="page-summary-label">해결된 질문</span>
              <span className="page-summary-value">{summary.resolved}</span>
            </div>
            <div className="page-summary-item">
              <span className="page-summary-label">미해결 질문</span>
              <span className="page-summary-value">{summary.unresolved}</span>
            </div>
            <div className="page-summary-item">
              <span className="page-summary-label">누적 답변</span>
              <span className="page-summary-value">{summary.answers}</span>
            </div>
          </div>
          <span className="page-toolbar-note">검색, 상태, 태그, 밀도를 한 패널 안에서 바로 조정할 수 있게 단순화했습니다.</span>
        </div>

        <div className="space-y-4">
            <div className="knowledge-search-grid">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white/90 py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none ring-slate-200 transition focus:border-slate-500 focus:ring-2"
                placeholder="제목, 내용, 태그, 작성자 검색 (/ 단축키)"
              />
            </div>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as KnowledgeSortOption)}
              className="select-soft"
            >
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowMineOnly((prev) => !prev)}
              className={`chip-filter ${showMineOnly ? 'chip-filter-active' : 'chip-filter-idle'}`}
            >
              내 질문만
            </button>
            <button
              type="button"
              onClick={() => setShowBookmarkedOnly((prev) => !prev)}
              className={`chip-filter ${showBookmarkedOnly ? 'chip-filter-active' : 'chip-filter-idle'}`}
            >
              북마크만
            </button>
          </div>

          <div className="action-row action-row-scroll">
            {CATEGORY_OPTIONS.map((category) => {
              const isActive = selectedCategory === category
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => setSelectedCategory(category)}
                  className={`chip-filter ${isActive ? 'chip-filter-active' : 'chip-filter-idle'}`}
                >
                  {category} ({categoryCounts[category]})
                </button>
              )
            })}
          </div>

            <div className="knowledge-status-row">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-600">
              <Filter className="h-3.5 w-3.5" />
              상태
            </div>
            <button
              type="button"
              onClick={() => setSelectedStatus('all')}
              className={`chip-filter ${selectedStatus === 'all' ? 'chip-filter-active' : 'chip-filter-idle'}`}
            >
              전체
            </button>
            <button
              type="button"
              onClick={() => setSelectedStatus('open')}
              className={`chip-filter ${selectedStatus === 'open' ? 'chip-filter-active' : 'chip-filter-idle'}`}
            >
              미해결
            </button>
            <button
              type="button"
              onClick={() => setSelectedStatus('resolved')}
              className={`chip-filter ${selectedStatus === 'resolved' ? 'chip-filter-active' : 'chip-filter-idle'}`}
            >
              해결됨
            </button>
            <button
              type="button"
              onClick={() => setSelectedStatus('unanswered')}
              className={`chip-filter ${selectedStatus === 'unanswered' ? 'chip-filter-active' : 'chip-filter-idle'}`}
            >
              답변 없음
            </button>
            <div className="ml-auto flex items-center gap-1 rounded-full border border-white/90 bg-white/70 p-1">
              <button
                type="button"
                onClick={() => setDensity('comfortable')}
                className={`chip-filter ${density === 'comfortable' ? 'chip-filter-active' : 'chip-filter-idle'} !px-2.5 !py-1`}
              >
                넓게
              </button>
              <button
                type="button"
                onClick={() => setDensity('compact')}
                className={`chip-filter ${density === 'compact' ? 'chip-filter-active' : 'chip-filter-idle'} !px-2.5 !py-1`}
              >
                컴팩트
              </button>
            </div>
          </div>

          {availableTagCounts.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold tracking-[0.05em] text-slate-500">인기 태그</p>
              <div className="action-row action-row-scroll">
                <button
                  type="button"
                  onClick={() => setSelectedTag('all')}
                  className={`chip-filter ${selectedTag === 'all' ? 'chip-filter-active' : 'chip-filter-idle'}`}
                >
                  전체
                </button>
                {availableTagCounts.map(([tag, count]) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setSelectedTag(tag)}
                    className={`chip-filter ${selectedTag === tag ? 'chip-filter-active' : 'chip-filter-idle'}`}
                  >
                    #{tag} ({count})
                  </button>
                ))}
              </div>
            </div>
          ) : null}

            <div className="knowledge-result-bar">
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <span>활성 필터 {activeFilterCount}개</span>
                <span className="text-slate-300">·</span>
                <span>현재 결과 {filteredQuestions.length}개</span>
                <span className="text-slate-300">·</span>
                <span>단축키 `/`, `Ctrl/Cmd + N`</span>
              </div>
              <button type="button" onClick={resetFilters} className="filter-chip-clear">
                빠른 초기화
              </button>
            </div>

          {showComposer ? (
              <form
                onSubmit={handleCreateQuestion}
                className="knowledge-composer-grid grid grid-cols-1 gap-3 rounded-2xl border border-white/80 bg-white/78 p-4 backdrop-blur-sm lg:grid-cols-6"
              >
              <input
                value={composerDraft.title}
                onChange={(event) => setComposerDraft((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="질문 제목"
                required
                className="select-soft lg:col-span-4"
              />
              <select
                value={composerDraft.category}
                onChange={(event) =>
                  setComposerDraft((prev) => ({
                    ...prev,
                    category: event.target.value as KnowledgeCategory,
                  }))
                }
                className="select-soft lg:col-span-2"
              >
                {CATEGORY_OPTIONS.filter((category): category is KnowledgeCategory => category !== '전체').map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <textarea
                value={composerDraft.content}
                onChange={(event) => setComposerDraft((prev) => ({ ...prev, content: event.target.value }))}
                placeholder="구체적인 상황, 기대 결과, 시도한 내용을 적어 주세요."
                required
                rows={4}
                className="select-soft lg:col-span-6"
              />
              <input
                value={composerDraft.tags}
                onChange={(event) => setComposerDraft((prev) => ({ ...prev, tags: event.target.value }))}
                placeholder="태그 (쉼표 구분, 예: React, 배포, 성능)"
                className="select-soft lg:col-span-5"
              />
              <OpalButton type="submit" variant="primary" size="sm" icon={<Sparkles className="h-4 w-4" />} className="lg:col-span-1">
                질문 등록
              </OpalButton>
              <div className="lg:col-span-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowComposer(false)
                    setComposerDraft(DEFAULT_COMPOSER_DRAFT)
                  }}
                  className="filter-chip-clear"
                >
                  작성 취소
                </button>
              </div>
            </form>
          ) : null}
        </div>
      </section>

        <section className="knowledge-feed">
          {filteredQuestions.map((question, index) => {
          const resolved = isResolved(question)
          const expanded = expandedQuestionId === question.id
          const isBookmarked = bookmarkedQuestionIdSet.has(question.id)
          const hasVotedQuestion = questionVoteIdSet.has(question.id)
          const isMine = question.author === CURRENT_USER.name
          const isHighlight = highlightQuestionId === question.id

          const sortedAnswers = [...question.answers].sort((a, b) => {
            const acceptedDiff = Number(b.isAccepted) - Number(a.isAccepted)
            if (acceptedDiff !== 0) {
              return acceptedDiff
            }
            if (b.helpful !== a.helpful) {
              return b.helpful - a.helpful
            }
            return parseDateValue(b.createdAt) - parseDateValue(a.createdAt)
          })

            const cardGapClass = density === 'compact' ? 'space-y-3' : 'space-y-4'
            const titleClass = density === 'compact' ? 'text-lg' : 'text-xl'
            const staggerClass = `stagger-${(index % 4) + 1}`

            return (
              <div
                key={question.id}
                className={`knowledge-thread-frame fade-up ${staggerClass} ${isHighlight ? 'knowledge-thread-highlight' : ''}`}
              >
                <OpalCard padding={density === 'compact' ? 'compact' : 'comfortable'} elevation="minimal">
                  <div className={`knowledge-thread-stack ${cardGapClass}`}>
                    <div className="knowledge-thread-head">
                      <div className="knowledge-thread-body">
                    <div className="flex flex-wrap items-center gap-2">
                      <OpalTag size="sm" category={question.category}>
                        {question.category}
                      </OpalTag>
                      {resolved ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-100/80 px-2 py-0.5 text-xs font-semibold text-sky-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          해결됨
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100/85 px-2 py-0.5 text-xs font-semibold text-slate-700">
                          <MessageCircleMore className="h-3.5 w-3.5" />
                          답변 필요
                        </span>
                      )}
                      {isBookmarked ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-100/80 px-2 py-0.5 text-xs font-semibold text-sky-700">
                          <Bookmark className="h-3.5 w-3.5" /> 북마크
                        </span>
                      ) : null}
                    </div>

                    {editingQuestionId === question.id ? (
                      <div className="space-y-2 rounded-2xl border border-white/80 bg-white/78 p-3">
                        <input
                          value={editingQuestionDraft.title}
                          onChange={(event) => setEditingQuestionDraft((prev) => ({ ...prev, title: event.target.value }))}
                          className="select-soft"
                        />
                        <select
                          value={editingQuestionDraft.category}
                          onChange={(event) =>
                            setEditingQuestionDraft((prev) => ({
                              ...prev,
                              category: event.target.value as KnowledgeCategory,
                            }))
                          }
                          className="select-soft"
                        >
                          {CATEGORY_OPTIONS.filter((category): category is KnowledgeCategory => category !== '전체').map((category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                        </select>
                        <textarea
                          value={editingQuestionDraft.content}
                          onChange={(event) => setEditingQuestionDraft((prev) => ({ ...prev, content: event.target.value }))}
                          rows={4}
                          className="select-soft"
                        />
                        <input
                          value={editingQuestionDraft.tags}
                          onChange={(event) => setEditingQuestionDraft((prev) => ({ ...prev, tags: event.target.value }))}
                          className="select-soft"
                        />
                        <div className="flex flex-wrap justify-end gap-2">
                          <OpalButton
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setEditingQuestionId(null)
                              setEditingQuestionDraft(DEFAULT_COMPOSER_DRAFT)
                            }}
                          >
                            취소
                          </OpalButton>
                          <OpalButton variant="primary" size="sm" onClick={() => handleSaveQuestionEdit(question.id)}>
                            저장
                          </OpalButton>
                        </div>
                      </div>
                    ) : (
                      <>
                        <h2 className={`${titleClass} font-semibold leading-tight text-slate-900`}>{question.title}</h2>
                        <p className="text-sm leading-relaxed text-slate-600">{question.content}</p>
                      </>
                    )}
                  </div>

                      <div className="knowledge-thread-actions">
                    <button
                      type="button"
                      onClick={() => handleToggleQuestionVote(question.id)}
                      className={`chip-filter ${hasVotedQuestion ? 'chip-filter-active' : 'chip-filter-idle'} inline-flex items-center gap-1.5`}
                    >
                      <ThumbsUp className="h-3.5 w-3.5" /> 추천 {question.votes}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleBookmark(question.id)}
                      className={`chip-filter ${isBookmarked ? 'chip-filter-active' : 'chip-filter-idle'} inline-flex items-center gap-1.5`}
                    >
                      <Bookmark className="h-3.5 w-3.5" />
                      {isBookmarked ? '북마크 해제' : '북마크'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleShareQuestion(question.id)}
                      className="chip-filter chip-filter-idle inline-flex items-center gap-1.5"
                    >
                      <Link2 className="h-3.5 w-3.5" /> 링크 공유
                    </button>
                    {isMine ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleStartQuestionEdit(question)}
                          className="chip-filter chip-filter-idle inline-flex items-center gap-1.5"
                        >
                          <Edit3 className="h-3.5 w-3.5" /> 수정
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteQuestion(question)}
                          className="chip-filter chip-filter-idle inline-flex items-center gap-1.5 text-rose-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> 삭제
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>

                    <div className="knowledge-thread-meta">
                  <span className="inline-flex items-center gap-1">
                    <User className="h-3.5 w-3.5" /> {question.author} ({question.department})
                  </span>
                  <span>작성 {formatRelativeTime(question.createdAt)}</span>
                  <span>업데이트 {formatRelativeTime(question.updatedAt)}</span>
                  <span className="inline-flex items-center gap-1">
                    <Eye className="h-3.5 w-3.5" /> {question.views}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MessageCircleMore className="h-3.5 w-3.5" /> 답변 {question.answers.length}
                  </span>
                </div>

                    <div className="knowledge-thread-tags">
                  {question.tags.length > 0 ? (
                    question.tags.map((tag) => (
                      <OpalTag key={`${question.id}-${tag}`} size="sm" variant="secondary">
                        #{tag}
                      </OpalTag>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500">태그 없음</span>
                  )}
                </div>

                <div className="border-t border-slate-200/80 pt-3">
                  <button type="button" onClick={() => handleToggleExpanded(question.id)} className="glass-inline-button">
                    {expanded ? (
                      <>
                        <ChevronUp className="h-4 w-4" /> 답변 접기
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-4 w-4" /> 답변 보기
                      </>
                    )}
                  </button>
                </div>

                    {expanded ? (
                      <div className="knowledge-answer-stack">
                    {sortedAnswers.length > 0 ? (
                      sortedAnswers.map((answer) => {
                        const answerKey = toAnswerKey(question.id, answer.id)
                        const isEditingAnswer = editingAnswerKey === answerKey
                        const helpfulActive = helpfulVoteKeySet.has(answerKey)
                        const answerIsMine = answer.author === CURRENT_USER.name
                        const canToggleAccept = question.author === CURRENT_USER.name

                        return (
                              <div
                                key={answer.id}
                                className={`knowledge-answer-card ${answer.isAccepted ? 'knowledge-answer-card-accepted' : ''}`}
                              >
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-slate-900">{answer.author}</span>
                                <span className="text-xs text-slate-500">{answer.department}</span>
                                {answer.isAccepted ? (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-100/80 px-2 py-0.5 text-xs font-semibold text-sky-700">
                                    <CheckCircle2 className="h-3.5 w-3.5" /> 채택 답변
                                  </span>
                                ) : null}
                                {answer.editedAt ? <span className="text-xs text-slate-500">(수정됨)</span> : null}
                              </div>
                              <span className="text-xs text-slate-500">{formatRelativeTime(answer.createdAt)}</span>
                            </div>

                            {isEditingAnswer ? (
                              <div className="space-y-2">
                                <textarea
                                  rows={3}
                                  value={editingAnswerContent}
                                  onChange={(event) => setEditingAnswerContent(event.target.value)}
                                  className="select-soft"
                                />
                                <div className="flex flex-wrap justify-end gap-2">
                                  <OpalButton
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => {
                                      setEditingAnswerKey(null)
                                      setEditingAnswerContent('')
                                    }}
                                  >
                                    취소
                                  </OpalButton>
                                  <OpalButton
                                    variant="primary"
                                    size="sm"
                                    onClick={() => handleSaveAnswerEdit(question.id, answer.id)}
                                  >
                                    저장
                                  </OpalButton>
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm leading-relaxed text-slate-700">{answer.content}</p>
                            )}

                                <div className="knowledge-answer-toolbar">
                              <button
                                type="button"
                                onClick={() => handleToggleHelpful(question.id, answer.id)}
                                className={`chip-filter ${helpfulActive ? 'chip-filter-active' : 'chip-filter-idle'} inline-flex items-center gap-1.5`}
                              >
                                <ThumbsUp className="h-3.5 w-3.5" /> 도움돼요 {answer.helpful}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleAnswerAccepted(question.id, answer.id)}
                                disabled={!canToggleAccept}
                                className={`chip-filter ${answer.isAccepted ? 'chip-filter-active' : 'chip-filter-idle'} inline-flex items-center gap-1.5 ${!canToggleAccept ? 'opacity-50 cursor-not-allowed' : ''}`}
                                title={canToggleAccept ? undefined : '질문 작성자만 채택할 수 있습니다.'}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                {answer.isAccepted ? '채택 해제' : '답변 채택'}
                              </button>
                              {answerIsMine ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleStartAnswerEdit(question.id, answer)}
                                    className="chip-filter chip-filter-idle inline-flex items-center gap-1.5"
                                  >
                                    <Edit3 className="h-3.5 w-3.5" /> 수정
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteAnswer(question.id, answer)}
                                    className="chip-filter chip-filter-idle inline-flex items-center gap-1.5 text-rose-700"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" /> 삭제
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </div>
                        )
                      })
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/65 px-4 py-8 text-center text-sm text-slate-500">
                        아직 등록된 답변이 없습니다. 첫 답변을 남겨 주세요.
                      </div>
                    )}

                        <div className="knowledge-composer-card">
                      <textarea
                        rows={3}
                        value={answerDrafts[String(question.id)] ?? ''}
                        onChange={(event) =>
                          setAnswerDrafts((prev) => ({
                            ...prev,
                            [String(question.id)]: event.target.value,
                          }))
                        }
                        placeholder="해결 방법, 실패 사례, 참고 링크를 남겨 주세요."
                        className="select-soft"
                      />
                      <div className="mt-3 flex justify-end">
                        <OpalButton
                          variant="primary"
                          size="sm"
                          icon={<Send className="h-4 w-4" />}
                          onClick={() => handleAddAnswer(question.id)}
                        >
                          답변 등록
                        </OpalButton>
                      </div>
                    </div>
                  </div>
                ) : null}
                  </div>
                </OpalCard>
              </div>
            )
          })}

        {filteredQuestions.length === 0 ? (
          <div className="empty-panel">
            <p className="text-sm text-slate-600">조건에 맞는 질문이 없습니다.</p>
            <p className="mt-2 text-xs text-slate-500">필터를 완화하거나 검색어를 조정해 보세요.</p>
            <div className="mt-4 flex justify-center">
              <OpalButton variant="secondary" size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={resetFilters}>
                필터 초기화
              </OpalButton>
            </div>
          </div>
        ) : null}
        </section>
    </PageShell>
  )
}
