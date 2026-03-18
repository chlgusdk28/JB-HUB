import { OpalProjectCard } from './OpalProjectCard';
import { OpalCard } from './OpalCard';

interface OpalHomePageProps {
  onProjectClick: (projectId: number) => void;
}

export function OpalHomePage({ onProjectClick }: OpalHomePageProps) {
  const projects = [
    {
      id: 1,
      title: 'AI 챗봇 자동 응답 시스템',
      description: '고객 문의 자동 처리를 위한 AI 기반 챗봇 시스템입니다. GPT-4를 활용한 자연어 처리 및 사내 FAQ 학습 기능을 포함하고 있습니다.',
      author: '김지현',
      department: 'IT기획팀',
      tags: ['Python', 'AI/ML', 'ChatGPT', 'FastAPI'],
      stars: 127,
      forks: 34,
    },
    {
      id: 2,
      title: '엑셀 데이터 자동화 스크립트',
      description: '반복적인 엑셀 작업을 자동화하는 Python 스크립트 모음입니다. 데이터 정제, 분석, 리포트 생성을 자동화합니다.',
      author: '이동훈',
      department: '재무팀',
      tags: ['Python', 'RPA', 'Excel', 'Pandas'],
      stars: 98,
      forks: 45,
    },
    {
      id: 3,
      title: 'React 디자인 시스템',
      description: '사내 웹 서비스를 위한 통합 디자인 시스템입니다. 재사용 가능한 UI 컴포넌트 라이브러리를 제공합니다.',
      author: '박서연',
      department: '프론트엔드팀',
      tags: ['React', 'TypeScript', 'Tailwind CSS'],
      stars: 156,
      forks: 28,
    },
    {
      id: 4,
      title: 'API 모니터링 대시보드',
      description: '실시간 API 성능 모니터링 및 장애 알림 시스템입니다. Grafana 기반 커스텀 대시보드를 제공합니다.',
      author: '최민수',
      department: '백엔드팀',
      tags: ['Node.js', 'Grafana', 'Monitoring'],
      stars: 82,
      forks: 19,
    },
  ];

  return (
    <div className="space-y-16">
      {/* Welcome Section */}
      <section className="text-center max-w-3xl mx-auto">
        <h1 className="text-5xl font-semibold text-gray-900 mb-6">
          오픈소스 커뮤니티
        </h1>
        <p className="text-xl text-gray-600 leading-relaxed">
          직원들이 개발한 코드, 스크립트, 자동화 도구를 공유하고 협업하세요
        </p>
      </section>

      {/* Stats Cards */}
      <section className="grid grid-cols-4 gap-6">
        {[
          { label: '프로젝트', value: '247' },
          { label: '활성 사용자', value: '1,856' },
          { label: '기여', value: '3,492' },
          { label: '이번 주', value: '128' },
        ].map((stat, index) => (
          <OpalCard key={index} padding="large">
            <div className="text-center">
              <div className="text-4xl font-semibold text-gray-900 mb-2">
                {stat.value}
              </div>
              <div className="text-[15px] text-gray-500">
                {stat.label}
              </div>
            </div>
          </OpalCard>
        ))}
      </section>

      {/* Trending Projects */}
      <section className="space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-semibold text-gray-900 mb-3">
            트렌딩 프로젝트
          </h2>
          <p className="text-[15px] text-gray-600">
            지금 가장 주목받고 있는 프로젝트들입니다
          </p>
        </div>

        <div className="space-y-6">
          {projects.map((project) => (
            <OpalProjectCard
              key={project.id}
              {...project}
              onClick={() => onProjectClick(project.id)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
