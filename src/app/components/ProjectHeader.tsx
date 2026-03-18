import { Star, GitFork, Eye, Download, Share2, Flag, Clock } from 'lucide-react'

interface ProjectHeaderProps {
  title: string
  description: string
  author: string
  department: string
  tags: string[]
  stars: number
  forks: number
  views: number
  isStarred?: boolean
  onStar: () => void
  onFork: () => void
  updatedAt: string
  createdAt: string
}

export function ProjectHeader({
  title,
  description,
  author,
  department,
  tags,
  stars,
  forks,
  views,
  isStarred = false,
  onStar,
  onFork,
  updatedAt,
  createdAt,
}: ProjectHeaderProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-200 p-6">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <h1 className="mb-3 text-3xl font-bold text-gray-900">{title}</h1>
            <p className="mb-5 text-base text-gray-600">{description}</p>

            <div className="flex items-center gap-4 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-400">
                  <span className="text-sm font-medium text-white">{author[0]}</span>
                </div>
                <div>
                  <div className="font-medium text-gray-900">{author}</div>
                  <div className="text-xs text-gray-500">{department}</div>
                </div>
              </div>

              <div className="h-6 w-px bg-gray-200" />

              <div className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                <span>최근 업데이트: {updatedAt}</span>
              </div>

              <div className="flex items-center gap-1.5">
                <span>생성일: {createdAt}</span>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {tags.map((tag, index) => (
                <span
                  key={index}
                  className="cursor-pointer rounded-md bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-all hover:bg-blue-100"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-shrink-0 flex-col gap-2">
            <button
              onClick={onStar}
              className={`flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 font-medium transition-all ${
                isStarred
                  ? 'border border-yellow-200 bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
                  : 'border border-gray-200 bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Star className={`h-4 w-4 ${isStarred ? 'fill-yellow-500' : ''}`} />
              <span>{isStarred ? '별표 해제' : '별표'}</span>
              <span className="text-sm">{stars}</span>
            </button>

            <button
              onClick={onFork}
              className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white transition-all hover:bg-blue-700"
            >
              <GitFork className="h-4 w-4" />
              <span>포크</span>
              <span className="text-sm">{forks}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-6 bg-gray-50 px-6 py-4 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4" />
          <span className="font-medium">{views.toLocaleString()}</span>
          <span>조회</span>
        </div>

        <div className="h-4 w-px bg-gray-300" />

        <div className="flex items-center gap-2">
          <GitFork className="h-4 w-4" />
          <span className="font-medium">{forks}</span>
          <span>포크</span>
        </div>

        <div className="h-4 w-px bg-gray-300" />

        <div className="flex items-center gap-2">
          <Star className="h-4 w-4" />
          <span className="font-medium">{stars}</span>
          <span>별표</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button className="flex items-center gap-2 rounded-lg px-3 py-1.5 transition-all hover:bg-gray-100">
            <Download className="h-4 w-4" />
            <span>다운로드</span>
          </button>
          <button className="flex items-center gap-2 rounded-lg px-3 py-1.5 transition-all hover:bg-gray-100">
            <Share2 className="h-4 w-4" />
            <span>공유</span>
          </button>
          <button className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-gray-500 transition-all hover:bg-gray-100">
            <Flag className="h-4 w-4" />
            <span>신고</span>
          </button>
        </div>
      </div>
    </div>
  )
}
