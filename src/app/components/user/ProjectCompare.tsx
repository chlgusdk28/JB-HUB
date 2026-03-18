import { useMemo, useState } from 'react'
import { GitCompare, X, Check, RotateCcw } from 'lucide-react'

interface Project {
  id: number
  title: string
  description: string
  author: string
  department: string
  tags: string[]
  stars: number
  forks: number
  views: number
  comments: number
  language?: string
  lastCommit?: string
  license?: string
  updatedAt?: string
}

interface ProjectCompareProps {
  projects: Project[]
  onClose: () => void
}

export function ProjectCompare({ projects, onClose }: ProjectCompareProps) {
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [compareData, setCompareData] = useState<Project[]>([])

  const maxCompare = 4
  const canCompare = selectedIds.length >= 2 && selectedIds.length <= maxCompare
  const topStars = useMemo(() => (compareData.length > 0 ? Math.max(...compareData.map((project) => project.stars)) : 0), [compareData])

  const toggleSelect = (id: number) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(sid => sid !== id))
    } else if (selectedIds.length < maxCompare) {
      setSelectedIds([...selectedIds, id])
    }
  }

  const handleCompare = () => {
    if (!canCompare) return
    const selectedProjects = projects.filter(p => selectedIds.includes(p.id))
    setCompareData(selectedProjects)
  }

  const resetSelection = () => {
    setCompareData([])
    setSelectedIds([])
  }

  if (compareData.length > 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
        <div className="surface-panel flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between border-b border-slate-200/80 p-5 sm:p-6">
            <div>
              <h2 className="inline-flex items-center gap-2 text-xl font-bold text-slate-900">
                <GitCompare className="h-5 w-5 text-[#315779]" />
                프로젝트 비교
              </h2>
              <p className="mt-1 text-sm text-slate-500">{compareData.length}개 프로젝트를 비교하고 있습니다.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={resetSelection}
                className="glass-inline-button !px-3 !py-1.5 text-xs"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                다시 선택
              </button>
              <button type="button" onClick={onClose} className="glass-inline-button !px-2.5 !py-1.5 text-xs">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-5 sm:p-6">
            <table className="min-w-full border-separate border-spacing-0">
              <tbody>
                <tr>
                  <td className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                    프로젝트
                  </td>
                  {compareData.map((project) => (
                    <td key={project.id} className="min-w-[220px] border border-slate-200 bg-white px-4 py-3 text-center">
                      <p className="text-sm font-semibold text-slate-900">
                        {project.title}
                      </p>
                    </td>
                  ))}
                </tr>

                <tr>
                  <td className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                    설명
                  </td>
                  {compareData.map((project) => (
                    <td key={project.id} className="border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                      <div className="line-clamp-3 min-h-[3.5rem]">
                        {project.description}
                      </div>
                    </td>
                  ))}
                </tr>

                <tr>
                  <td className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                    작성자
                  </td>
                  {compareData.map((project) => (
                    <td key={project.id} className="border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                      {project.author}
                      <br />
                      <span className="text-xs text-slate-500">{project.department}</span>
                    </td>
                  ))}
                </tr>

                <tr>
                  <td className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                    별표
                  </td>
                  {compareData.map((project) => (
                    <td key={project.id} className="border border-slate-200 bg-white px-4 py-3 text-center">
                      <span className={`text-sm font-semibold ${project.stars === topStars ? 'text-[#315779]' : 'text-slate-900'}`}>
                        {project.stars}
                      </span>
                      {project.stars === topStars && (
                        <span className="ml-2 rounded-full border border-[#315779]/35 bg-[#eaf1f8] px-2 py-0.5 text-xs font-semibold text-[#1f3e5a]">
                          상위
                        </span>
                      )}
                    </td>
                  ))}
                </tr>

                <tr>
                  <td className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                    포크
                  </td>
                  {compareData.map((project) => (
                    <td key={project.id} className="border border-slate-200 bg-white px-4 py-3 text-center text-sm text-slate-800">
                      {project.forks}
                    </td>
                  ))}
                </tr>

                <tr>
                  <td className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                    조회수
                  </td>
                  {compareData.map((project) => (
                    <td key={project.id} className="border border-slate-200 bg-white px-4 py-3 text-center text-sm text-slate-800">
                      {project.views}
                    </td>
                  ))}
                </tr>

                <tr>
                  <td className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                    댓글
                  </td>
                  {compareData.map((project) => (
                    <td key={project.id} className="border border-slate-200 bg-white px-4 py-3 text-center text-sm text-slate-800">
                      {project.comments}
                    </td>
                  ))}
                </tr>

                <tr>
                  <td className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                    태그
                  </td>
                  {compareData.map((project) => (
                    <td key={project.id} className="border border-slate-200 bg-white px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {project.tags?.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                  ))}
                </tr>

                <tr>
                  <td className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                    언어
                  </td>
                  {compareData.map((project) => (
                    <td key={project.id} className="border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                      {project.language || '-'}
                    </td>
                  ))}
                </tr>

                <tr>
                  <td className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                    라이선스
                  </td>
                  {compareData.map((project) => (
                    <td key={project.id} className="border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                      {project.license || '미지정'}
                    </td>
                  ))}
                </tr>

                <tr>
                  <td className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                    마지막 업데이트
                  </td>
                  {compareData.map((project) => (
                    <td key={project.id} className="border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                      {project.lastCommit || project.updatedAt || '-'}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-slate-200/80 bg-slate-50/80 p-5 text-sm text-slate-600">
            <p>핵심 지표를 한 화면에서 비교해 의사결정을 빠르게 진행하세요.</p>
            <button type="button" onClick={onClose} className="glass-inline-button !px-4 !py-2 text-xs">
              닫기
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
      <div className="surface-panel flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-200/80 p-5 sm:p-6">
          <div>
            <h2 className="inline-flex items-center gap-2 text-xl font-bold text-slate-900">
              <GitCompare className="h-5 w-5 text-[#315779]" />
              프로젝트 비교
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {selectedIds.length > 0
                ? `${selectedIds.length}개 선택됨 (최대 ${maxCompare}개)`
                : `비교할 프로젝트를 2~${maxCompare}개 선택하세요`
              }
            </p>
          </div>
          <button type="button" onClick={onClose} className="glass-inline-button !px-2.5 !py-1.5 text-xs">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5 sm:p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {projects.map((project) => {
              const isSelected = selectedIds.includes(project.id)
              return (
                <div
                  key={project.id}
                  onClick={() => toggleSelect(project.id)}
                  className={`cursor-pointer rounded-xl border p-4 transition-colors ${
                    isSelected
                      ? 'border-[#315779]/45 bg-[#eaf1f8]'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-sm font-semibold text-slate-900">{project.title}</h3>
                        {isSelected && (
                          <Check className="h-4 w-4 text-[#315779]" />
                        )}
                      </div>
                      <p className="line-clamp-2 text-sm text-slate-500">{project.description}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {project.tags?.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-semibold text-slate-900">{project.stars}</div>
                      <div className="text-xs text-slate-500">{project.department}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200/80 p-5">
          <p className="text-sm text-slate-500">
            {selectedIds.length < 2
              ? '최소 2개를 선택해주세요'
              : `${selectedIds.length}개 선택 완료`
            }
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="glass-inline-button !px-4 !py-2 text-xs"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleCompare}
              disabled={!canCompare}
              className="inline-flex items-center gap-2 rounded-xl border border-[#264969] bg-[#264969] px-5 py-2 text-sm font-semibold text-white transition-colors hover:border-[#1f3e5a] hover:bg-[#1f3e5a] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <GitCompare className="h-4 w-4" />
              비교하기
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
