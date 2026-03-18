import { useState, useEffect } from 'react'
import { MessageCircle, HelpCircle, Check, ChevronDown, ChevronUp } from 'lucide-react'

interface Question {
  id: number
  projectId: number
  author: string
  authorDepartment: string
  question: string
  answers: Answer[]
  votes: number
  createdAt: string
  isResolved?: boolean
}

interface Answer {
  id: number
  questionId: number
  author: string
  authorDepartment: string
  content: string
  isAccepted: boolean
  helpful: number
  createdAt: string
}

interface ProjectQAProps {
  projectId: number
}

export function ProjectQA({ projectId }: ProjectQAProps) {
  const [questions, setQuestions] = useState<Question[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  // 질문 폼
  const [question, setQuestion] = useState('')

  // 답변 폼
  const [answeringTo, setAnsweringTo] = useState<number | null>(null)
  const [answer, setAnswer] = useState('')

  useEffect(() => {
    fetchQuestions()
  }, [projectId])

  const fetchQuestions = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/qa`)
      if (response.ok) {
        const data = await response.json()
        setQuestions(data.questions || [])
      }
    } catch {
      // 데모 데이터
      setQuestions([
        {
          id: 1,
          projectId,
          author: '박서연',
          authorDepartment: '프론트엔드팀',
          question: '이 프로젝트를 React 18로 마이그레이션할 때 주의할 점이 있나요?',
          votes: 5,
          createdAt: new Date(Date.now() - 86400000).toISOString(),
          isResolved: true,
          answers: [
            {
              id: 1,
              questionId: 1,
              author: '김지현',
              authorDepartment: 'IT기획팀',
              content: '네, React 18의 자동 batch 업데이트를 주의하세요. useMemo, useCallback의 의존성 배열을 확인하고, Strict Mode 문제를 해결해야 합니다.',
              isAccepted: true,
              helpful: 8,
              createdAt: new Date(Date.now() - 82800000).toISOString(),
            },
          ],
        },
        {
          id: 2,
          projectId,
          author: '이민준',
          authorDepartment: '개발팀',
          question: 'Docker 이미지 빌드는 어떻게 하나요?',
          votes: 3,
          createdAt: new Date(Date.now() - 43200000).toISOString(),
          answers: [],
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const handleAskQuestion = async () => {
    if (!question.trim()) return

    try {
      const response = await fetch(`/api/v1/projects/${projectId}/qa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim() }),
      })

      if (response.ok) {
        const data = await response.json()
        setQuestions([data.question, ...questions])
        setQuestion('')
        setShowForm(false)
      }
    } catch {
      const newQuestion: Question = {
        id: Date.now(),
        projectId,
        author: '방문자',
        authorDepartment: '방문자',
        question: question.trim(),
        votes: 0,
        createdAt: new Date().toISOString(),
        answers: [],
      }
      setQuestions([newQuestion, ...questions])
      setQuestion('')
      setShowForm(false)
    }
  }

  const handleVote = async (questionId: number) => {
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/qa/${questionId}/vote`, {
        method: 'POST',
      })
      if (response.ok) {
        setQuestions(questions.map(q =>
          q.id === questionId ? { ...q, votes: q.votes + 1 } : q
        ))
      }
    } catch {
      setQuestions(questions.map(q =>
        q.id === questionId ? { ...q, votes: q.votes + 1 } : q
      ))
    }
  }

  const handleSubmitAnswer = async (questionId: number) => {
    if (!answer.trim()) return

    try {
      const response = await fetch(`/api/v1/projects/${projectId}/qa/${questionId}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: answer.trim() }),
      })

      if (response.ok) {
        const data = await response.json()
        setQuestions(questions.map(q =>
          q.id === questionId
            ? { ...q, answers: [...q.answers, data.answer], isResolved: true }
            : q
        ))
        setAnswer('')
        setAnsweringTo(null)
      }
    } catch {
      const newAnswer: Answer = {
        id: Date.now(),
        questionId,
        author: '방문자',
        authorDepartment: '방문자',
        content: answer.trim(),
        isAccepted: false,
        helpful: 0,
        createdAt: new Date().toISOString(),
      }
      setQuestions(questions.map(q =>
        q.id === questionId
          ? { ...q, answers: [...q.answers, newAnswer], isResolved: true }
          : q
      ))
      setAnswer('')
      setAnsweringTo(null)
    }
  }

  const handleAcceptAnswer = async (questionId: number, answerId: number) => {
    setQuestions(questions.map(q => {
      if (q.id === questionId) {
        return {
          ...q,
          answers: q.answers.map(a =>
            a.id === answerId ? { ...a, isAccepted: true } : { ...a, isAccepted: false }
          ),
        }
      }
      return q
    }))
  }

  const handleHelpful = async (questionId: number, answerId: number) => {
    setQuestions(questions.map(q => {
      if (q.id === questionId) {
        return {
          ...q,
          answers: q.answers.map(a =>
            a.id === answerId ? { ...a, helpful: a.helpful + 1 } : a
          ),
        }
      }
      return q
    }))
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()

    if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}일 전`
    return date.toLocaleDateString('ko-KR')
  }

  return (
    <div className="space-y-6">
      {/* 질문하기 버튼 */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-900">
            질문답변 ({questions.length})
          </h3>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <HelpCircle className="w-4 h-4" />
          질문하기
        </button>
      </div>

      {/* 질문 작성 폼 */}
      {showForm && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h4 className="font-medium text-gray-900 mb-4">질문하기</h4>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="프로젝트에 대해 궁금한 점을 물어보세요..."
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <div className="flex justify-end gap-3 mt-3">
            <button
              onClick={() => {
                setShowForm(false)
                setQuestion('')
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              취소
            </button>
            <button
              onClick={handleAskQuestion}
              disabled={!question.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              질문 등록
            </button>
          </div>
        </div>
      )}

      {/* Q&A 목록 */}
      {isLoading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      ) : questions.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <HelpCircle className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p className="text-lg font-medium text-gray-700">아직 질문이 없습니다.</p>
          <p className="text-sm text-gray-500 mt-1">첫 번째 질문을 등록해보세요!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {questions.map((q) => {
            const isExpanded = expandedId === q.id
            return (
              <div key={q.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                {/* 질문 */}
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-blue-600 font-medium text-sm">Q</span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{q.author}</span>
                          <span className="text-xs text-gray-500">{q.authorDepartment}</span>
                          {q.isResolved && (
                            <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              해결됨
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-400">{formatTime(q.createdAt)}</span>
                      </div>
                      <p className="text-gray-700">{q.question}</p>

                      {/* 질문 하단 액션 */}
                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center gap-4">
                          <button
                            onClick={() => handleVote(q.id)}
                            className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600"
                          >
                            <span>👍</span>
                            <span>{q.votes}</span>
                          </button>
                          <button
                            onClick={() => {
                              if (isExpanded) {
                                setExpandedId(null)
                              } else {
                                setExpandedId(q.id)
                              }
                            }}
                            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                          >
                            {q.answers.length > 0 && (
                              <span>{q.answers.length}개 답변</span>
                            )}
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 답변들 */}
                {(isExpanded || q.answers.length > 0) && (
                  <div className="border-t border-gray-200">
                    {q.answers.length > 0 ? (
                      q.answers.map((answer) => (
                        <div key={answer.id} className="p-4 border-b border-gray-100 last:border-b-0">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                              <span className="text-green-600 font-medium text-sm">A</span>
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-gray-900">{answer.author}</span>
                                  <span className="text-xs text-gray-500">{answer.authorDepartment}</span>
                                  {answer.isAccepted && (
                                    <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                                      채택됨
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-gray-400">{formatTime(answer.createdAt)}</span>
                              </div>
                              <p className="text-gray-700 mb-3">{answer.content}</p>

                              {/* 답변 액션 */}
                              {!answer.isAccepted && q.answers.length > 0 && (
                                <button
                                  onClick={() => handleAcceptAnswer(q.id, answer.id)}
                                  className="text-xs text-blue-600 hover:text-blue-700"
                                >
                                  ✓ 이 답변 채택
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-4 text-center text-gray-500 text-sm">
                        아직 답변이 없습니다.
                      </div>
                    )}

                    {/* 답변 작성 */}
                    {answeringTo === q.id ? (
                      <div className="p-4 bg-gray-50">
                        <textarea
                          value={answer}
                          onChange={(e) => setAnswer(e.target.value)}
                          placeholder="답변을 입력하세요..."
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none text-sm"
                        />
                        <div className="flex justify-end gap-2 mt-2">
                          <button
                            onClick={() => {
                              setAnswer('')
                              setAnsweringTo(null)
                            }}
                            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100"
                          >
                            취소
                          </button>
                          <button
                            onClick={() => handleSubmitAnswer(q.id)}
                            disabled={!answer.trim()}
                            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                          >
                            답변 등록
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4">
                        <button
                          onClick={() => setAnsweringTo(q.id)}
                          className="w-full py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-800"
                        >
                          답변 작성하기
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
