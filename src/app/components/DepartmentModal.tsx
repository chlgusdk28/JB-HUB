import { X, Users, Trophy, Briefcase } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { OpalCard } from './opal/OpalCard'
import { OpalTag } from './opal/OpalTag'

interface DepartmentModalProps {
  department: {
    name: string
    totalProjects: number
    totalStars: number
    activeMembers: number
    topProjects: Array<{
      id: number
      title: string
      stars: number
      tags: string[]
    }>
    members: Array<{
      name: string
      avatar: string
      stars: number
    }>
  }
  onClose: () => void
  onProjectClick?: (projectId: number) => void
}

export function DepartmentModal({ department, onClose, onProjectClick }: DepartmentModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose])

  const handleBackdropClick = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-8" onClick={handleBackdropClick}>
      <div
        ref={modalRef}
        className="custom-scrollbar max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-gray-50 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#CBD5E1 #F1F5F9' }}
      >
        <style>{`
          .custom-scrollbar::-webkit-scrollbar {
            width: 8px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: #F1F5F9;
            border-radius: 10px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #CBD5E1;
            border-radius: 10px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: #94A3B8;
          }
        `}</style>

        <div className="sticky top-0 z-10 rounded-t-3xl border-b border-gray-200 bg-white px-10 py-8">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100">
                <Briefcase className="h-8 w-8 text-blue-600" strokeWidth={1.5} />
              </div>
              <div>
                <h2 className="mb-2 text-3xl font-semibold text-gray-900">{department.name}</h2>
                <p className="text-sm text-gray-500">부서 정보</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-gray-100"
              aria-label="닫기"
            >
              <X className="h-5 w-5 text-gray-500" strokeWidth={2} />
            </button>
          </div>
        </div>

        <div className="space-y-8 px-10 py-8">
          <div className="grid grid-cols-3 gap-6">
            <OpalCard padding="spacious" elevation="low">
              <div className="text-center">
                <div className="mb-2 text-4xl font-bold text-blue-600">{department.totalStars}</div>
                <div className="text-sm text-gray-500">누적 별표</div>
              </div>
            </OpalCard>
            <OpalCard padding="spacious" elevation="low">
              <div className="text-center">
                <div className="mb-2 text-4xl font-bold text-gray-900">{department.totalProjects}</div>
                <div className="text-sm text-gray-500">프로젝트 수</div>
              </div>
            </OpalCard>
            <OpalCard padding="spacious" elevation="low">
              <div className="text-center">
                <div className="mb-2 text-4xl font-bold text-gray-600">{department.activeMembers}</div>
                <div className="text-sm text-gray-500">활동 인원</div>
              </div>
            </OpalCard>
          </div>

          <div>
            <h3 className="mb-4 flex items-center gap-2 text-xl font-semibold text-gray-900">
              <Trophy className="h-5 w-5 text-yellow-500" />
              대표 프로젝트
            </h3>
            <div className="space-y-3">
              {department.topProjects.map((project) => (
                <OpalCard
                  key={project.id}
                  padding="spacious"
                  elevation="low"
                  onClick={() => {
                    onClose()
                    onProjectClick?.(project.id)
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h4 className="mb-2 cursor-pointer text-lg font-semibold text-gray-900 transition-colors hover:text-blue-600">
                        {project.title}
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {project.tags.map((tag) => (
                          <OpalTag key={tag} size="sm" variant="primary">
                            {tag}
                          </OpalTag>
                        ))}
                      </div>
                    </div>
                    <div className="ml-4 text-right">
                      <div className="text-2xl font-bold text-blue-600">{project.stars}</div>
                      <div className="text-xs text-gray-500">별표</div>
                    </div>
                  </div>
                </OpalCard>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-4 flex items-center gap-2 text-xl font-semibold text-gray-900">
              <Users className="h-5 w-5 text-blue-600" />
              활동 멤버
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {department.members.map((member) => (
                <OpalCard key={member.name} padding="comfortable" elevation="minimal">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-lg font-semibold text-blue-700">
                      {member.avatar}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-gray-900">{member.name}</div>
                      <div className="text-xs text-gray-500">별표 {member.stars}</div>
                    </div>
                  </div>
                </OpalCard>
              ))}
            </div>
          </div>
        </div>

        <div className="h-8" />
      </div>
    </div>
  )
}
