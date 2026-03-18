import { MessageSquare, ThumbsUp, MoreVertical, Send } from 'lucide-react';
import { useState } from 'react';

interface Comment {
  id: number;
  author: string;
  department: string;
  content: string;
  time: string;
  likes: number;
  isLiked: boolean;
  replies: Reply[];
}

interface Reply {
  id: number;
  author: string;
  department: string;
  content: string;
  time: string;
}

export function DiscussionTab() {
  const [comments, setComments] = useState<Comment[]>([
    {
      id: 1,
      author: '이민준',
      department: '개발팀',
      content: '정말 유용한 프로젝트네요! 우리 팀에서도 활용해보고 싶습니다. 혹시 사내 Slack 채널과 연동하는 방법도 있을까요?',
      time: '3시간 전',
      likes: 5,
      isLiked: false,
      replies: [
        {
          id: 11,
          author: '김지현',
          department: 'IT기획팀',
          content: '감사합니다! Slack 연동은 config.py 파일에서 Slack API 토큰을 설정하시면 됩니다. 자세한 내용은 README의 "Slack 연동" 섹션을 참고해주세요.',
          time: '2시간 전',
        },
        {
          id: 12,
          author: '이민준',
          department: '개발팀',
          content: '답변 감사합니다! 바로 적용해보겠습니다.',
          time: '1시간 전',
        },
      ],
    },
    {
      id: 2,
      author: '박서연',
      department: '고객지원팀',
      content: 'API 연동 부분에 대한 문서를 더 추가해주시면 좋을 것 같아요. 특히 에러 핸들링 관련 내용이 있으면 좋겠습니다.',
      time: '1일 전',
      likes: 3,
      isLiked: true,
      replies: [],
    },
    {
      id: 3,
      author: '정수아',
      department: 'DevOps팀',
      content: 'Docker 이미지로도 배포할 수 있나요? 컨테이너 환경에서 사용하고 싶습니다.',
      time: '2일 전',
      likes: 2,
      isLiked: false,
      replies: [
        {
          id: 31,
          author: '김지현',
          department: 'IT기획팀',
          content: 'Dockerfile을 추가 예정입니다. 다음 업데이트에서 확인하실 수 있을 것 같습니다!',
          time: '1일 전',
        },
      ],
    },
  ]);

  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyText, setReplyText] = useState('');

  const handleLike = (commentId: number) => {
    setComments((prev) =>
      prev.map((comment) =>
        comment.id === commentId
          ? {
              ...comment,
              isLiked: !comment.isLiked,
              likes: comment.isLiked ? comment.likes - 1 : comment.likes + 1,
            }
          : comment
      )
    );
  };

  return (
    <div className="space-y-6">
      {/* New Comment Form */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-white text-sm font-medium">나</span>
          </div>
          <div className="flex-1">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="댓글을 입력하세요... @멘션을 사용할 수 있습니다"
              className="w-full p-3 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              rows={3}
            />
            <div className="flex items-center justify-between mt-3">
              <div className="text-xs text-gray-500">
                Markdown 문법을 지원합니다
              </div>
              <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all text-sm font-medium">
                <Send className="w-4 h-4" />
                댓글 작성
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Comments List */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-gray-600" />
          토론 ({comments.length})
        </h3>

        {comments.map((comment) => (
          <div key={comment.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {/* Comment Header & Content */}
            <div className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full flex items-center justify-center">
                    <span className="text-white text-sm font-medium">{comment.author[0]}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900">{comment.author}</span>
                      <span className="text-xs text-gray-500">· {comment.department}</span>
                      <span className="text-xs text-gray-500">· {comment.time}</span>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed">{comment.content}</p>
                  </div>
                </div>
                <button className="p-1 hover:bg-gray-100 rounded transition-all">
                  <MoreVertical className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              {/* Comment Actions */}
              <div className="flex items-center gap-4 ml-13">
                <button
                  onClick={() => handleLike(comment.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all text-sm ${
                    comment.isLiked
                      ? 'bg-blue-50 text-blue-600'
                      : 'hover:bg-gray-50 text-gray-600'
                  }`}
                >
                  <ThumbsUp className={`w-4 h-4 ${comment.isLiked ? 'fill-blue-600' : ''}`} />
                  <span className="font-medium">{comment.likes}</span>
                </button>
                
                <button
                  onClick={() => setReplyingTo(comment.id === replyingTo ? null : comment.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-gray-50 rounded-lg transition-all text-sm text-gray-600"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>답글</span>
                </button>
              </div>

              {/* Reply Form */}
              {replyingTo === comment.id && (
                <div className="mt-4 ml-13 pl-4 border-l-2 border-gray-200">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-xs font-medium">나</span>
                    </div>
                    <div className="flex-1">
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder={`${comment.author}님에게 답글 작성...`}
                        className="w-full p-2.5 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        rows={2}
                      />
                      <div className="flex items-center gap-2 mt-2">
                        <button className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all text-sm font-medium">
                          답글 작성
                        </button>
                        <button
                          onClick={() => setReplyingTo(null)}
                          className="px-3 py-1.5 hover:bg-gray-100 rounded-lg transition-all text-sm text-gray-600"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Replies */}
            {comment.replies.length > 0 && (
              <div className="bg-gray-50 border-t border-gray-200 px-5 py-4">
                <div className="space-y-4">
                  {comment.replies.map((reply) => (
                    <div key={reply.id} className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-green-400 to-blue-400 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-xs font-medium">{reply.author[0]}</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-gray-900 text-sm">{reply.author}</span>
                          <span className="text-xs text-gray-500">· {reply.department}</span>
                          <span className="text-xs text-gray-500">· {reply.time}</span>
                        </div>
                        <p className="text-sm text-gray-700">{reply.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
