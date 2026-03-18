import { QuietProjectCard } from './QuietProjectCard';

interface QuietHomePageProps {
  onProjectClick: (projectId: number) => void;
}

export function QuietHomePage({ onProjectClick }: QuietHomePageProps) {
  const projects = [
    {
      id: 1,
      title: 'AI 챗봇 자동 응답 시스템',
      description: '고객 문의 자동 처리를 위한 AI 기반 챗봇 시스템입니다.',
      author: '김지현',
    },
    {
      id: 2,
      title: '엑셀 데이터 자동화 스크립트',
      description: '반복적인 엑셀 작업을 자동화하는 Python 스크립트 모음입니다.',
      author: '이동훈',
    },
    {
      id: 3,
      title: 'React 디자인 시스템',
      description: '사내 웹 서비스를 위한 통합 디자인 시스템입니다.',
      author: '박서연',
    },
    {
      id: 4,
      title: 'API 모니터링 대시보드',
      description: '실시간 API 성능 모니터링 및 장애 알림 시스템입니다.',
      author: '최민수',
    },
    {
      id: 5,
      title: 'Slack 봇 알림 자동화',
      description: '프로젝트 진행 상황을 Slack으로 자동 알림해주는 봇입니다.',
      author: '정수아',
    },
  ];

  return (
    <div className="space-y-16">
      {/* Header */}
      <header className="pt-16 pb-8">
        <h1 className="text-5xl text-gray-900 mb-6 font-medium">
          트렌딩 프로젝트
        </h1>
        <p className="text-lg text-gray-500">
          지금 주목받고 있는 프로젝트
        </p>
      </header>

      {/* Projects */}
      <section className="space-y-8">
        {projects.map((project) => (
          <QuietProjectCard
            key={project.id}
            {...project}
            onClick={() => onProjectClick(project.id)}
          />
        ))}
      </section>
    </div>
  );
}
