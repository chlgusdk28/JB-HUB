import { FormEvent, useState } from 'react'
import { Bookmark, Eye, MessageSquare, Send, Share2, ThumbsUp } from 'lucide-react'
import type { DiscussionCategory, DiscussionComment, DiscussionPost } from '../data/discussions'
import { OpalButton } from './opal/OpalButton'
import { OpalCard } from './opal/OpalCard'
import { OpalTag } from './opal/OpalTag'

interface CommunityDiscussionDetailProps {
  discussion: DiscussionPost
  comments: DiscussionComment[]
  onAddComment: (message: string) => void
  onToggleLike: () => void
}

const DISCUSSION_CATEGORY_LABELS: Record<DiscussionCategory, string> = {
  Question: '질문',
  'How-To': '가이드',
  Showcase: '사례 공유',
  Comparison: '비교',
  Announcement: '공지',
}

export function CommunityDiscussionDetail({
  discussion,
  comments,
  onAddComment,
  onToggleLike,
}: CommunityDiscussionDetailProps) {
  const [commentInput, setCommentInput] = useState('')
  const [bookmarked, setBookmarked] = useState(false)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalized = commentInput.trim()
    if (!normalized) {
      return
    }
    onAddComment(normalized)
    setCommentInput('')
  }

  return (
    <div className="page-shell">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
            {DISCUSSION_CATEGORY_LABELS[discussion.category]}
          </span>
          <span className="text-xs text-slate-500">{discussion.createdAt}</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{discussion.title}</h1>
        <p className="text-sm text-slate-600 sm:text-base">{discussion.summary}</p>
        <p className="text-xs text-slate-500">
          {discussion.author} · {discussion.department}
        </p>
      </header>

      <OpalCard padding="comfortable" elevation="minimal">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            {discussion.tags.map((tag) => (
              <OpalTag key={tag} size="sm" variant="primary">
                {tag}
              </OpalTag>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
            <OpalButton variant="secondary" size="sm" icon={<ThumbsUp className="h-4 w-4" />} onClick={onToggleLike}>
              좋아요 ({discussion.likes})
            </OpalButton>
            <OpalButton
              variant="secondary"
              size="sm"
              icon={<Bookmark className="h-4 w-4" />}
              onClick={() => setBookmarked((prev) => !prev)}
            >
              {bookmarked ? '저장됨' : '저장'}
            </OpalButton>
            <OpalButton variant="secondary" size="sm" icon={<Share2 className="h-4 w-4" />}>
              공유
            </OpalButton>
            <div className="ml-auto flex items-center gap-4 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">
                <Eye className="h-3.5 w-3.5" />
                {discussion.views}
              </span>
              <span className="inline-flex items-center gap-1">
                <MessageSquare className="h-3.5 w-3.5" />
                {comments.length}
              </span>
            </div>
          </div>
        </div>
      </OpalCard>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">댓글</h2>
        <form onSubmit={handleSubmit} className="surface-panel rounded-2xl p-4">
          <div className="space-y-3">
            <textarea
              value={commentInput}
              onChange={(event) => setCommentInput(event.target.value)}
              placeholder="댓글을 입력하세요..."
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none ring-slate-200 transition focus:border-slate-500 focus:ring-2"
              rows={4}
            />
            <div className="flex justify-end">
              <OpalButton type="submit" variant="primary" size="sm" icon={<Send className="h-4 w-4" />}>
                댓글 등록
              </OpalButton>
            </div>
          </div>
        </form>

        <div className="space-y-3">
          {comments.map((comment) => (
            <OpalCard key={comment.id} padding="comfortable" elevation="minimal">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{comment.author}</p>
                    <p className="text-xs text-slate-500">
                      {comment.department} · {comment.createdAt}
                    </p>
                  </div>
                  <span className="text-xs text-slate-500">좋아요 {comment.likes}</span>
                </div>
                <p className="text-sm leading-relaxed text-slate-700">{comment.message}</p>
              </div>
            </OpalCard>
          ))}
          {comments.length === 0 ? (
            <div className="empty-panel">
              <p className="text-sm text-slate-600">아직 댓글이 없습니다.</p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
