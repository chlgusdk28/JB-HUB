import { Star, FolderGit2, BookOpen, ExternalLink, TrendingUp } from 'lucide-react';

interface RightPanelProps {
  onProjectClick: (projectId: number) => void;
}

export function RightPanel({ onProjectClick }: RightPanelProps) {
  const myProjects = [
    { id: 1, name: 'AI 챗봇 자동 응답 시스템', updates: 3 },
    { id: 2, name: 'Slack 봇 알림 자동화', updates: 0 },
    { id: 8, name: 'Docker 배포 자동화', updates: 1 },
  ];

  const favoriteProjects = [
    { id: 3, name: 'React 디자인 시스템', stars: 156 },
    { id: 4, name: 'API 모니터링 대시보드', stars: 82 },
  ];

  const quickLinks = [
    { label: '시작 가이드', icon: BookOpen },
    { label: '베스트 프랙티스', icon: TrendingUp },
    { label: '문서 작성 가이드', icon: ExternalLink },
  ];

  return (
    <div className="w-80 space-y-5">
      {/* My Projects */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <FolderGit2 className="w-4 h-4 text-gray-600" />
          <h3 className="font-semibold text-gray-900 text-sm">내 프로젝트</h3>
        </div>
        <div className="space-y-2">
          {myProjects.map((project) => (
            <div
              key={project.id}
              onClick={() => onProjectClick(project.id)}
              className="flex items-start justify-between p-2.5 hover:bg-gray-50 rounded-lg cursor-pointer transition-all group"
            >
              <span className="text-sm text-gray-700 group-hover:text-blue-600 line-clamp-2 flex-1">
                {project.name}
              </span>
              {project.updates > 0 && (
                <span className="ml-2 w-5 h-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center flex-shrink-0">
                  {project.updates}
                </span>
              )}
            </div>
          ))}
        </div>
        <button className="w-full mt-3 pt-3 border-t border-gray-100 text-sm text-blue-600 hover:text-blue-700 font-medium text-left">
          전체 보기 →
        </button>
      </div>

      {/* Favorite Projects */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Star className="w-4 h-4 text-yellow-600" />
          <h3 className="font-semibold text-gray-900 text-sm">즐겨찾기</h3>
        </div>
        <div className="space-y-2">
          {favoriteProjects.map((project) => (
            <div
              key={project.id}
              onClick={() => onProjectClick(project.id)}
              className="flex items-start justify-between p-2.5 hover:bg-gray-50 rounded-lg cursor-pointer transition-all group"
            >
              <span className="text-sm text-gray-700 group-hover:text-blue-600 line-clamp-2 flex-1">
                {project.name}
              </span>
              <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                <Star className="w-3.5 h-3.5 text-gray-400 fill-gray-400" />
                <span className="text-xs text-gray-500">{project.stars}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Links */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="font-semibold text-gray-900 text-sm mb-4">빠른 접근</h3>
        <div className="space-y-1">
          {quickLinks.map((link, index) => {
            const Icon = link.icon;
            return (
              <button
                key={index}
                className="w-full flex items-center gap-2.5 p-2.5 hover:bg-gray-50 rounded-lg transition-all text-left group"
              >
                <Icon className="w-4 h-4 text-gray-400 group-hover:text-blue-600" />
                <span className="text-sm text-gray-700 group-hover:text-blue-600">
                  {link.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tips */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-5">
        <h3 className="font-semibold text-gray-900 text-sm mb-2">💡 Tip</h3>
        <p className="text-sm text-gray-700 leading-relaxed">
          프로젝트에 README.md 파일을 추가하면 더 많은 동료들이 쉽게 이해하고 활용할 수 있습니다.
        </p>
      </div>
    </div>
  );
}
