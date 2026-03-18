import { TrendingUp, Zap, ChevronRight, Clock } from 'lucide-react';
import { ProjectCard } from './ProjectCard';
import { ActivityFeed } from './ActivityFeed';

interface HomePageProps {
  onProjectClick: (projectId: number) => void;
}

export function HomePage({ onProjectClick }: HomePageProps) {
  const popularProjects = [
    {
      id: 1,
      title: 'AI 챗봇 자동 응답 시스템',
      description: '고객 문의 자동 처리를 위한 AI 기반 챗봇 시스템. GPT-4를 활용한 자연어 처리 및 사내 FAQ 학습 기능 포함',
      author: '김지현',
      department: 'IT기획팀',
      tags: ['Python', 'AI/ML', 'ChatGPT', 'FastAPI'],
      stars: 127,
      forks: 34,
      updatedAt: '2시간 전',
    },
    {
      id: 2,
      title: '엑셀 데이터 자동화 스크립트',
      description: '반복적인 엑셀 작업을 자동화하는 Python 스크립트 모음. 데이터 정제, 분석, 리포트 생성 자동화',
      author: '이동훈',
      department: '재무팀',
      tags: ['Python', 'RPA', 'Excel', 'Pandas'],
      stars: 98,
      forks: 45,
      updatedAt: '5시간 전',
    },
    {
      id: 3,
      title: 'React 디자인 시스템',
      description: '사내 웹 서비스를 위한 통합 디자인 시스템. 재사용 가능한 UI 컴포넌트 라이브러리',
      author: '박서연',
      department: '프론트엔드팀',
      tags: ['React', 'TypeScript', 'Tailwind CSS', 'Storybook'],
      stars: 156,
      forks: 28,
      updatedAt: '1일 전',
    },
    {
      id: 4,
      title: 'API 모니터링 대시보드',
      description: '실시간 API 성능 모니터링 및 장애 알림 시스템. Grafana 기반 커스텀 대시보드',
      author: '최민수',
      department: '백엔드팀',
      tags: ['Node.js', 'Grafana', 'Monitoring', 'Docker'],
      stars: 82,
      forks: 19,
      updatedAt: '2일 전',
    },
  ];

  const recentUpdates = [
    {
      id: 5,
      title: 'Slack 봇 알림 자동화',
      description: '프로젝트 진행 상황을 Slack으로 자동 알림해주는 봇. Jira, GitHub 통합',
      author: '정수아',
      department: 'DevOps팀',
      tags: ['Node.js', 'Slack API', 'Automation'],
      stars: 45,
      forks: 12,
      updatedAt: '30분 전',
    },
    {
      id: 6,
      title: '보안 취약점 스캐너',
      description: 'AWS 리소스의 보안 취약점을 자동으로 스캔하고 리포트를 생성하는 도구',
      author: '강태호',
      department: '보안팀',
      tags: ['Python', 'AWS', 'Security', 'CLI'],
      stars: 67,
      forks: 15,
      updatedAt: '1시간 전',
    },
    {
      id: 7,
      title: '문서 템플릿 생성기',
      description: '제안서, 계약서 등 업무 문서를 자동으로 생성하는 템플릿 엔진',
      author: '윤혜진',
      department: '법무팀',
      tags: ['Python', 'Document', 'Automation'],
      stars: 38,
      forks: 8,
      updatedAt: '3시간 전',
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-sm transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">총 프로젝트</span>
            <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-blue-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900 mb-1">247</div>
          <div className="text-xs text-green-600 font-medium">+12 이번 주</div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-sm transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">활성 사용자</span>
            <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center">
              <span className="text-lg">👥</span>
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900 mb-1">1,856</div>
          <div className="text-xs text-green-600 font-medium">+24 이번 주</div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-sm transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">총 기여</span>
            <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center">
              <span className="text-lg">🌟</span>
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900 mb-1">3,492</div>
          <div className="text-xs text-green-600 font-medium">+156 이번 주</div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-sm transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">이번 주 업데이트</span>
            <div className="w-8 h-8 bg-yellow-50 rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4 text-yellow-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900 mb-1">128</div>
          <div className="text-xs text-gray-500">활발한 활동</div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Projects */}
        <div className="lg:col-span-2 space-y-6">
          {/* Welcome Banner */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-8 text-white">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold mb-2">오픈소스 커뮤니티에 오신 것을 환영합니다</h2>
                <p className="text-blue-100 mb-6">
                  직원들이 개발한 코드, 스크립트, 자동화 도구를 공유하고 협업하세요
                </p>
                <div className="flex gap-3">
                  <button className="px-5 py-2.5 bg-white text-blue-600 rounded-lg font-medium hover:bg-blue-50 transition-all">
                    프로젝트 둘러보기
                  </button>
                  <button className="px-5 py-2.5 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-400 transition-all">
                    시작 가이드
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Trending Projects */}
          <section>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                <h2 className="text-xl font-bold text-gray-900">트렌딩 프로젝트</h2>
              </div>
              <button className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium">
                전체 보기
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {popularProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  {...project}
                  onClick={() => onProjectClick(project.id)}
                />
              ))}
            </div>
          </section>

          {/* Recent Updates */}
          <section>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-yellow-600" />
                <h2 className="text-xl font-bold text-gray-900">최근 업데이트</h2>
              </div>
              <button className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium">
                전체 보기
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {recentUpdates.map((project) => (
                <ProjectCard
                  key={project.id}
                  {...project}
                  onClick={() => onProjectClick(project.id)}
                />
              ))}
            </div>
          </section>
        </div>

        {/* Right Column - Activity Feed */}
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-5 sticky top-24">
            <div className="flex items-center gap-2 mb-5">
              <Clock className="w-5 h-5 text-gray-600" />
              <h3 className="font-semibold text-gray-900">최신 활동</h3>
            </div>
            <ActivityFeed />
            <button className="w-full mt-5 pt-4 border-t border-gray-100 text-sm text-blue-600 hover:text-blue-700 font-medium text-center">
              전체 활동 보기 →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}