import { GitCommit, GitFork, Star, FileText, MessageSquare } from 'lucide-react';

interface ActivityItem {
  id: number;
  type: 'commit' | 'fork' | 'star' | 'update' | 'comment';
  user: string;
  action: string;
  details?: string;
  time: string;
  date: string;
}

export function ActivityTab() {
  const activities: ActivityItem[] = [
    {
      id: 1,
      type: 'commit',
      user: '김지현',
      action: 'main.py 파일 업데이트',
      details: '대화 히스토리 저장 기능 추가',
      time: '오후 2:34',
      date: '2024-01-13',
    },
    {
      id: 2,
      type: 'commit',
      user: '김지현',
      action: 'config.py 수정',
      details: '환경 변수 설정 개선',
      time: '오후 1:15',
      date: '2024-01-13',
    },
    {
      id: 3,
      type: 'fork',
      user: '이민준',
      action: '프로젝트를 포크했습니다',
      time: '오전 11:23',
      date: '2024-01-12',
    },
    {
      id: 4,
      type: 'star',
      user: '박서연',
      action: '별표를 추가했습니다',
      time: '오전 10:45',
      date: '2024-01-12',
    },
    {
      id: 5,
      type: 'comment',
      user: '정수아',
      action: '댓글을 작성했습니다',
      details: '"정말 유용한 프로젝트네요!"',
      time: '오후 4:20',
      date: '2024-01-11',
    },
    {
      id: 6,
      type: 'update',
      user: '김지현',
      action: 'README.md 작성',
      details: '프로젝트 문서 추가',
      time: '오후 3:10',
      date: '2024-01-10',
    },
    {
      id: 7,
      type: 'commit',
      user: '김지현',
      action: '초기 프로젝트 생성',
      details: '기본 구조 설정',
      time: '오전 9:00',
      date: '2024-01-05',
    },
  ];

  // Group activities by date
  const groupedActivities = activities.reduce((acc, activity) => {
    if (!acc[activity.date]) {
      acc[activity.date] = [];
    }
    acc[activity.date].push(activity);
    return acc;
  }, {} as Record<string, ActivityItem[]>);

  const getIcon = (type: ActivityItem['type']) => {
    switch (type) {
      case 'commit':
        return <GitCommit className="w-4 h-4 text-purple-600" />;
      case 'fork':
        return <GitFork className="w-4 h-4 text-blue-600" />;
      case 'star':
        return <Star className="w-4 h-4 text-yellow-600" />;
      case 'update':
        return <FileText className="w-4 h-4 text-green-600" />;
      case 'comment':
        return <MessageSquare className="w-4 h-4 text-indigo-600" />;
    }
  };

  const getIconBg = (type: ActivityItem['type']) => {
    switch (type) {
      case 'commit':
        return 'bg-purple-50';
      case 'fork':
        return 'bg-blue-50';
      case 'star':
        return 'bg-yellow-50';
      case 'update':
        return 'bg-green-50';
      case 'comment':
        return 'bg-indigo-50';
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return '오늘';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return '어제';
    } else {
      return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
    }
  };

  return (
    <div className="space-y-8">
      {Object.entries(groupedActivities).map(([date, items]) => (
        <div key={date}>
          <h3 className="text-sm font-semibold text-gray-900 mb-4 sticky top-0 bg-gray-50 py-2 z-10">
            {formatDate(date)}
          </h3>
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>

            <div className="space-y-6">
              {items.map((activity, index) => (
                <div key={activity.id} className="relative flex gap-4">
                  {/* Timeline dot */}
                  <div className={`w-8 h-8 ${getIconBg(activity.type)} rounded-full flex items-center justify-center flex-shrink-0 relative z-10 border-2 border-white`}>
                    {getIcon(activity.type)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 pb-2">
                    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-all">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full flex items-center justify-center">
                            <span className="text-white text-xs font-medium">{activity.user[0]}</span>
                          </div>
                          <span className="font-medium text-gray-900 text-sm">{activity.user}</span>
                        </div>
                        <span className="text-xs text-gray-500">{activity.time}</span>
                      </div>
                      
                      <p className="text-sm text-gray-700 mb-1">{activity.action}</p>
                      
                      {activity.details && (
                        <p className="text-sm text-gray-600 bg-gray-50 rounded px-3 py-2 mt-2">
                          {activity.details}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
