import { useState, useEffect } from 'react'
import { Star as StarIcon, ThumbsUp, ThumbsDown, Edit, Trash2, Flag } from 'lucide-react'

interface Review {
  id: number
  projectId: number
  author: string
  authorDepartment: string
  rating: number
  title: string
  content: string
  pros: string[]
  cons: string[]
  createdAt: string
  updatedAt?: string
  helpful: number
  notHelpful: number
  canEdit?: boolean
  canDelete?: boolean
}

interface ReviewStats {
  averageRating: number
  totalReviews: number
  ratingDistribution: { 5: number; 4: number; 3: number; 2: number; 1: number }
}

interface ProjectReviewsProps {
  projectId: number
}

export function ProjectReviews({ projectId }: ProjectReviewsProps) {
  const [reviews, setReviews] = useState<Review[]>([])
  const [stats, setStats] = useState<ReviewStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [editingReview, setEditingReview] = useState<Review | null>(null)

  // 리뷰 작성 폼
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [pros, setPros] = useState('')
  const [cons, setCons] = useState('')

  useEffect(() => {
    fetchReviews()
  }, [projectId])

  const fetchReviews = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/reviews`)
      if (response.ok) {
        const data = await response.json()
        setReviews(data.reviews || [])
        setStats(data.stats || null)
      }
    } catch {
      // 데모 데이터
      setReviews([
        {
          id: 1,
          projectId,
          author: '김지현',
          authorDepartment: 'IT기획팀',
          rating: 5,
          title: '정말 유용한 프로젝트입니다!',
          content: '팀에서 바로 적용해보니 효율이 크게 올랐습니다. 특히 문서화가 잘 되어 있어서 참고하기 쉬웠어요.',
          pros: ['문서화가 철저함', '코드가 깔끔함', '신속한 대응'],
          cons: ['초기 설정이 복잡함'],
          createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
          helpful: 15,
          notHelpful: 1,
        },
        {
          id: 2,
          projectId,
          author: '이민준',
          authorDepartment: '개발팀',
          rating: 4,
          title: '좋은 프로젝트지만 개선 여지가 있어요',
          content: '전반적으로 잘 만들어졌지만 몇 가지 버그가 있어요. 특히 대용량 데이터 처리 시 속도가 조금 느린 것 같아요.',
          pros: ['기능이 풍부함', 'UI가 직관적임'],
          cons: ['성능 이슈', '버그가 있음'],
          createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
          helpful: 8,
          notHelpful: 2,
        },
      ])
      setStats({
        averageRating: 4.5,
        totalReviews: 2,
        ratingDistribution: { 5: 1, 4: 1, 3: 0, 2: 0, 1: 0 },
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmitReview = async () => {
    if (!rating || !title.trim() || !content.trim()) {
      alert('별점, 제목, 내용을 모두 작성해주세요.')
      return
    }

    try {
      const response = await fetch(`/api/v1/projects/${projectId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating,
          title: title.trim(),
          content: content.trim(),
          pros: pros.split('\n').filter(p => p.trim()).map(p => p.trim()),
          cons: cons.split('\n').filter(c => c.trim()).map(c => c.trim()),
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setReviews([data.review, ...reviews])
        setStats(data.stats)
        resetForm()
        setShowReviewForm(false)
      }
    } catch {
      // 데모 모드
      const newReview: Review = {
        id: Date.now(),
        projectId,
        author: '방문자',
        authorDepartment: '방문자',
        rating,
        title: title.trim(),
        content: content.trim(),
        pros: pros.split('\n').filter(p => p.trim()).map(p => p.trim()),
        cons: cons.split('\n').filter(c => c.trim()).map(c => c.trim()),
        createdAt: new Date().toISOString(),
        helpful: 0,
        notHelpful: 0,
      }
      setReviews([newReview, ...reviews])
      setStats({
        averageRating: ((stats?.averageRating || 0) * stats!.totalReviews + rating) / ((stats?.totalReviews || 0) + 1),
        totalReviews: (stats?.totalReviews || 0) + 1,
        ratingDistribution: { ...stats?.ratingDistribution, [rating]: ((stats?.ratingDistribution?.[rating] || 0) + 1) },
      })
      resetForm()
      setShowReviewForm(false)
    }
  }

  const resetForm = () => {
    setRating(0)
    setTitle('')
    setContent('')
    setPros('')
    setCons('')
  }

  const handleHelpful = async (reviewId: number) => {
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/reviews/${reviewId}/helpful`, {
        method: 'POST',
      })
      if (response.ok) {
        setReviews(reviews.map(r =>
          r.id === reviewId ? { ...r, helpful: r.helpful + 1 } : r
        ))
      }
    } catch {
      setReviews(reviews.map(r =>
        r.id === reviewId ? { ...r, helpful: r.helpful + 1 } : r
      ))
    }
  }

  const handleNotHelpful = async (reviewId: number) => {
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/reviews/${reviewId}/not-helpful`, {
        method: 'POST',
      })
      if (response.ok) {
        setReviews(reviews.map(r =>
          r.id === reviewId ? { ...r, notHelpful: r.notHelpful + 1 } : r
        ))
      }
    } catch {
      setReviews(reviews.map(r =>
        r.id === reviewId ? { ...r, notHelpful: r.notHelpful + 1 } : r
      ))
    }
  }

  const handleDeleteReview = async (reviewId: number) => {
    if (!confirm('리뷰를 삭제하시겠습니까?')) return

    try {
      const response = await fetch(`/api/v1/projects/${projectId}/reviews/${reviewId}`, {
        method: 'DELETE',
      })
      if (response.ok) {
        setReviews(reviews.filter(r => r.id !== reviewId))
      }
    } catch {
      setReviews(reviews.filter(r => r.id !== reviewId))
    }
  }

  const renderStars = (rating: number, interactive = false, size = 'w-5 h-5') => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            disabled={!interactive}
            onMouseEnter={() => interactive && setHoverRating(star)}
            onMouseLeave={() => interactive && setHoverRating(0)}
            onClick={() => interactive && setRating(star)}
            className={`${interactive ? 'cursor-pointer hover:scale-110 transition-transform' : ''}`}
          >
            <StarIcon
              className={`${size} ${
                star <= (interactive ? hoverRating || rating : rating)
                  ? 'text-yellow-400 fill-yellow-400'
                  : 'text-gray-300'
              }`}
            />
          </button>
        ))}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 평균 별점 & 통계 */}
      {stats && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">사용자 평가</h3>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-4xl font-bold text-gray-900">
                    {stats.averageRating.toFixed(1)}
                  </span>
                  {renderStars(Math.round(stats.averageRating))}
                </div>
                <span className="text-gray-500">
                  총 {stats.totalReviews}개의 평가
                </span>
              </div>
            </div>

            {/* 별점 분포 */}
            <div className="space-y-2">
              {[5, 4, 3, 2, 1].reverse().map((star) => {
                const count = stats.ratingDistribution[star as keyof typeof stats.ratingDistribution] || 0
                const percentage = stats.totalReviews > 0 ? (count / stats.totalReviews) * 100 : 0
                return (
                  <div key={star} className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 w-12">{star}점</span>
                    <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-yellow-400 rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="text-sm text-gray-500 w-8">{count}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* 리뷰 작성 버튼 */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowReviewForm(!showReviewForm)}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <StarIcon className="w-4 h-4" />
          리뷰 작성
        </button>
      </div>

      {/* 리뷰 작성 폼 */}
      {showReviewForm && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">리뷰 작성</h3>

          <div className="space-y-4">
            {/* 별점 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                별점 <span className="text-red-500">*</span>
              </label>
              {renderStars(rating, true)}
            </div>

            {/* 제목 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                제목 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="이 프로젝트를 한 문장으로 요약해주세요"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                maxLength={100}
              />
            </div>

            {/* 내용 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                상세 리뷰 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="이 프로젝트의 장단점을 설명해주세요"
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
                maxLength={1000}
              />
            </div>

            {/* 장점 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                장점 (선택사항, 줄바꿈으로 구분)
              </label>
              <textarea
                value={pros}
                onChange={(e) => setPros(e.target.value)}
                placeholder="좋았던 점을 나열해주세요"
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none text-sm"
              />
            </div>

            {/* 단점 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                단점 (선택사항, 줄바꿈으로 구분)
              </label>
              <textarea
                value={cons}
                onChange={(e) => setCons(e.target.value)}
                placeholder="개선이 필요한 점을 나열해주세요"
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none text-sm"
              />
            </div>

            {/* 버튼 */}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowReviewForm(false)
                  resetForm()
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handleSubmitReview}
                disabled={!rating || !title.trim() || !content.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                리뷰 제출
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 리뷰 목록 */}
      <div className="space-y-4">
        {reviews.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <StarIcon className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium text-gray-700">아직 리뷰가 없습니다.</p>
            <p className="text-sm text-gray-500 mt-1">첫 번째 리뷰를 작성해보세요!</p>
          </div>
        ) : (
          reviews.map((review) => (
            <div key={review.id} className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-lg">
                    {review.author.charAt(0)}
                  </span>
                </div>

                <div className="flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-gray-900">{review.author}</span>
                        <span className="text-sm text-gray-500">{review.authorDepartment}</span>
                        {renderStars(review.rating, false, 'w-4 h-4')}
                      </div>
                      <h4 className="font-semibold text-gray-900">{review.title}</h4>
                    </div>

                    {review.canDelete && (
                      <button
                        onClick={() => handleDeleteReview(review.id)}
                        className="p-1 text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <p className="text-gray-700 mb-4">{review.content}</p>

                  {/* 장점/단점 */}
                  {(review.pros?.length > 0 || review.cons?.length > 0) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      {review.pros?.length > 0 && (
                        <div className="bg-green-50 rounded-lg p-3">
                          <p className="text-sm font-medium text-green-800 mb-2">장점</p>
                          <ul className="text-sm text-green-700 space-y-1">
                            {review.pros.map((pro, i) => (
                              <li key={i}>• {pro}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {review.cons?.length > 0 && (
                        <div className="bg-red-50 rounded-lg p-3">
                          <p className="text-sm font-medium text-red-800 mb-2">단점</p>
                          <ul className="text-sm text-red-700 space-y-1">
                            {review.cons.map((con, i) => (
                              <li key={i}>• {con}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 도움이 됐나요? */}
                  <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                    <span className="text-xs text-gray-500">
                      {new Date(review.createdAt).toLocaleDateString('ko-KR')}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleHelpful(review.id)}
                        className="flex items-center gap-1 text-sm text-gray-500 hover:text-green-600"
                      >
                        <ThumbsUp className="w-4 h-4" />
                        도움이 됨 ({review.helpful})
                      </button>
                      <button
                        onClick={() => handleNotHelpful(review.id)}
                        className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-600"
                      >
                        <ThumbsDown className="w-4 h-4" />
                        안 됨 ({review.notHelpful})
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
