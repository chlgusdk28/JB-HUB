import { Search } from 'lucide-react';
import { useState } from 'react';
import { OpalProjectCard } from './OpalProjectCard';
import { OpalCard } from './OpalCard';

interface OpalExplorePageProps {
  onProjectClick: (projectId: number) => void;
}

export function OpalExplorePage({ onProjectClick }: OpalExplorePageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const categories = [
    { id: 'all', label: '전체' },
    { id: 'ai-ml', label: 'AI/ML' },
    { id: 'automation', label: '자동화' },
    { id: 'frontend', label: '프론트엔드' },
    { id: 'backend', label: '백엔드' },
    { id: 'devops', label: 'DevOps' },
  ];

  const projects = [
    {
      id: 1,
      title: 'AI 챗봇 자동 응답 시스템',
      description: '고객 문의 자동 처리를 위한 AI 기반 챗봇 시스템입니다. GPT-4를 활용한 자연어 처리 및 사내 FAQ 학습 기능을 포함하고 있습니다.',
      author: '김지현',
      department: 'IT기획팀',
      tags: ['Python', 'AI/ML', 'ChatGPT'],
      stars: 127,
      forks: 34,
    },
    {
      id: 2,
      title: '엑셀 데이터 자동화 스크립트',
      description: '반복적인 엑셀 작업을 자동화하는 Python 스크립트 모음입니다. 데이터 정제, 분석, 리포트 생성을 자동화합니다.',
      author: '이동훈',
      department: '재무팀',
      tags: ['Python', 'RPA', 'Excel'],
      stars: 98,
      forks: 45,
    },
    {
      id: 3,
      title: 'React 디자인 시스템',
      description: '사내 웹 서비스를 위한 통합 디자인 시스템입니다. 재사용 가능한 UI 컴포넌트 라이브러리를 제공합니다.',
      author: '박서연',
      department: '프론트엔드팀',
      tags: ['React', 'TypeScript', 'Tailwind'],
      stars: 156,
      forks: 28,
    },
  ];

  return (
    <div className="space-y-12">
      {/* Header */}
      <section className="text-center max-w-3xl mx-auto space-y-6">
        <h1 className="text-4xl font-semibold text-gray-900">
          프로젝트 탐색
        </h1>
        <p className="text-[15px] text-gray-600">
          사내에 공유된 모든 프로젝트를 검색하고 탐색하세요
        </p>
      </section>

      {/* Search */}
      <section>
        <OpalCard padding="medium">
          <div className="relative">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="프로젝트명, 태그, 작성자로 검색..."
              className="w-full pl-16 pr-6 py-5 bg-transparent text-lg placeholder:text-gray-400 focus:outline-none"
            />
          </div>
        </OpalCard>
      </section>

      {/* Categories */}
      <section className="flex justify-center gap-3">
        {categories.map((category) => (
          <button
            key={category.id}
            onClick={() => setSelectedCategory(category.id)}
            className={`px-6 py-3 rounded-xl text-[15px] font-medium transition-all ${
              selectedCategory === category.id
                ? 'bg-blue-50 text-blue-600'
                : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
            }`}
          >
            {category.label}
          </button>
        ))}
      </section>

      {/* Results */}
      <section className="space-y-8">
        <div className="text-center">
          <p className="text-[15px] text-gray-500">
            총 <span className="font-semibold text-gray-900">{projects.length}</span>개의 프로젝트
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
