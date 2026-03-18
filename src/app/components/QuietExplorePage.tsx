import { Search } from 'lucide-react';
import { useState } from 'react';
import { QuietProjectCard } from './QuietProjectCard';
import { QuietFilter } from './QuietFilter';

interface QuietExplorePageProps {
  onProjectClick: (projectId: number) => void;
}

export function QuietExplorePage({ onProjectClick }: QuietExplorePageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const handleTagToggle = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

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
    <div className="flex gap-20">
      {/* Filter Sidebar */}
      <aside className="w-40 flex-shrink-0 pt-24">
        <QuietFilter
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          selectedTags={selectedTags}
          onTagToggle={handleTagToggle}
        />
      </aside>

      {/* Main Content */}
      <div className="flex-1 space-y-16">
        {/* Search */}
        <section className="pt-16">
          <div className="relative pb-1 border-b border-gray-200">
            <Search className="absolute left-0 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="검색"
              className="w-full pl-9 pb-3 bg-transparent text-xl text-gray-900 placeholder:text-gray-300 focus:outline-none"
            />
          </div>
        </section>

        {/* Results */}
        <section className="space-y-8 pb-32">
          {projects.map((project) => (
            <QuietProjectCard
              key={project.id}
              {...project}
              onClick={() => onProjectClick(project.id)}
            />
          ))}
        </section>
      </div>
    </div>
  );
}