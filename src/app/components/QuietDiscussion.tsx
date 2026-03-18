interface Comment {
  id: number;
  author: string;
  content: string;
  timestamp: string;
}

interface QuietDiscussionProps {
  comments: Comment[];
}

export function QuietDiscussion({ comments }: QuietDiscussionProps) {
  return (
    <div className="space-y-16">
      {/* New Comment */}
      <div
        className="bg-white rounded-3xl p-12 transition-all duration-300 ease-out"
        style={{
          boxShadow:
            '0 1px 2px rgba(0, 0, 0, 0.03), 0 2px 4px rgba(0, 0, 0, 0.02), 0 8px 16px rgba(0, 0, 0, 0.01)',
        }}
      >
        <div className="space-y-6">
          <div className="text-xs text-gray-400">새 댓글</div>
          <textarea
            placeholder="의견을 남겨주세요"
            className="w-full h-32 px-0 py-3 bg-transparent border-b border-gray-200 text-base text-gray-800 placeholder:text-gray-300 focus:outline-none focus:border-gray-300 resize-none transition-colors"
          />
          <button className="px-5 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors rounded-lg">
            작성
          </button>
        </div>
      </div>

      {/* Comments List */}
      <div className="space-y-8">
        {comments.map((comment) => (
          <div
            key={comment.id}
            className="bg-white rounded-3xl p-12 transition-all duration-300 ease-out"
            style={{
              boxShadow:
                '0 1px 2px rgba(0, 0, 0, 0.03), 0 2px 4px rgba(0, 0, 0, 0.02), 0 8px 16px rgba(0, 0, 0, 0.01)',
            }}
          >
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-gray-200 rounded-full flex-shrink-0"></div>
              <div className="flex-1 space-y-4">
                <div className="space-y-1">
                  <div className="text-sm text-gray-800">{comment.author}</div>
                  <div className="text-xs text-gray-400">{comment.timestamp}</div>
                </div>
                <p className="text-base text-gray-600 leading-relaxed">
                  {comment.content}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}