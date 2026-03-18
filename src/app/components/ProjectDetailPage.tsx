import { FileText, MessageSquare, Clock, History } from 'lucide-react';
import { useState } from 'react';
import { ProjectHeader } from './ProjectHeader';
import { OverviewTab } from './OverviewTab';
import { FilesTab } from './FilesTab';
import { ActivityTab } from './ActivityTab';
import { DiscussionTab } from './DiscussionTab';
import { useToast } from './ToastProvider';

interface ProjectDetailPageProps {
  projectId: number;
}

export function ProjectDetailPage({ projectId }: ProjectDetailPageProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'files' | 'activity' | 'discussion'>('overview');
  const [isStarred, setIsStarred] = useState(false);
  const { info } = useToast();

  const project = {
    title: 'AI 챗봇 자동 응답 시스템',
    description: '고객 문의 자동 처리를 위한 AI 기반 챗봇 시스템. GPT-4를 활용한 자연어 처리 및 사내 FAQ 학습 기능 포함',
    author: '김지현',
    department: 'IT기획팀',
    tags: ['Python', 'AI/ML', 'ChatGPT', 'FastAPI'],
    stars: 127,
    forks: 34,
    views: 1245,
    updatedAt: '2024-01-12',
    createdAt: '2023-11-05',
  };

  const tabs: Array<{
    id: 'overview' | 'files' | 'activity' | 'discussion'
    label: string
    icon: React.ComponentType<{ className?: string }>
  }> = [
    { id: 'overview', label: '개요', icon: FileText },
    { id: 'files', label: '파일 / 산출물', icon: FileText },
    { id: 'activity', label: '변경 이력', icon: History },
    { id: 'discussion', label: '토론', icon: MessageSquare },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewTab />;
      case 'files':
        return <FilesTab projectId={projectId} />;
      case 'activity':
        return <ActivityTab />;
      case 'discussion':
        return <DiscussionTab />;
      default:
        return <OverviewTab />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Project Header */}
      <ProjectHeader
        {...project}
        isStarred={isStarred}
        onStar={() => setIsStarred(!isStarred)}
        onFork={() => info('포크 기능은 추후 구현될 예정입니다.')}
      />

      {/* Tabs Navigation */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex border-b border-gray-200 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-all border-b-2 whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'text-blue-600 border-blue-600 bg-blue-50'
                    : 'text-gray-600 border-transparent hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
}
