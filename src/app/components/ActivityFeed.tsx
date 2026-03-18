import { GitFork, Star, MessageSquare, FileText, Plus } from 'lucide-react';

interface Activity {
  id: number;
  type: 'fork' | 'star' | 'comment' | 'update' | 'create';
  user: string;
  project: string;
  description: string;
  time: string;
}

export function ActivityFeed() {
  const activities: Activity[] = [
    {
      id: 1,
      type: 'fork',
      user: '이민준',
      project: 'AI 챗봇 자동 응답 시스템',
      description: '프로젝트를 포크했습니다',
      time: '5분 전',
    },
    {
      id: 2,
      type: 'star',
      user: '박서연',
      project: 'React 디자인 시스템',
      description: '별표를 추가했습니다',
      time: '12분 전',
    },
    {
      id: 3,
      type: 'comment',
      user: '정수아',
      project: 'API 모니터링 대시보드',
      description: '댓글을 작성했습니다',
      time: '23분 전',
    },
    {
      id: 4,
      type: 'update',
      user: '김지현',
      project: 'AI 챗봇 자동 응답 시스템',
      description: 'main.py 파일을 업데이트했습니다',
      time: '45분 전',
    },
    {
      id: 5,
      type: 'create',
      user: '강태호',
      project: '보안 취약점 스캐너',
      description: '새 프로젝트를 생성했습니다',
      time: '1시간 전',
    },
    {
      id: 6,
      type: 'fork',
      user: '윤혜진',
      project: '엑셀 데이터 자동화 스크립트',
      description: '프로젝트를 포크했습니다',
      time: '2시간 전',
    },
    {
      id: 7,
      type: 'star',
      user: '최민수',
      project: 'Slack 봇 알림 자동화',
      description: '별표를 추가했습니다',
      time: '3시간 전',
    },
  ];

  const getIcon = (type: Activity['type']) => {
    switch (type) {
      case 'fork':
        return <GitFork className="w-4 h-4 text-blue-600" />;
      case 'star':
        return <Star className="w-4 h-4 text-yellow-600" />;
      case 'comment':
        return <MessageSquare className="w-4 h-4 text-green-600" />;
      case 'update':
        return <FileText className="w-4 h-4 text-purple-600" />;
      case 'create':
        return <Plus className="w-4 h-4 text-indigo-600" />;
    }
  };

  const getIconBg = (type: Activity['type']) => {
    switch (type) {
      case 'fork':
        return 'bg-blue-50';
      case 'star':
        return 'bg-yellow-50';
      case 'comment':
        return 'bg-green-50';
      case 'update':
        return 'bg-purple-50';
      case 'create':
        return 'bg-indigo-50';
    }
  };

  return (
    <div className="space-y-3">
      {activities.map((activity, index) => (
        <div
          key={activity.id}
          className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-b-0"
        >
          <div className={`w-8 h-8 ${getIconBg(activity.type)} rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5`}>
            {getIcon(activity.type)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-900">
              <span className="font-medium">{activity.user}</span>
              <span className="text-gray-600"> {activity.description}</span>
            </p>
            <p className="text-sm text-blue-600 hover:text-blue-700 cursor-pointer truncate">
              {activity.project}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{activity.time}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
