import { Mail, MapPin, Calendar, Star, GitFork, FileText } from 'lucide-react';
import { ProjectCard } from './ProjectCard';

interface ProfilePageProps {
  onProjectClick: (projectId: number) => void;
}

export function ProfilePage({ onProjectClick }: ProfilePageProps) {
  const user = {
    name: '김지현',
    department: 'IT기획팀',
    role: '시니어 개발자',
    email: 'jihyun.kim@company.com',
    location: '서울 본사',
    joinedDate: '2021년 3월',
    bio: '사내 자동화와 AI 기술에 관심이 많은 개발자입니다. 팀의 생산성을 높이는 도구를 만드는 것을 좋아합니다.',
  };

  const stats = [
    { label: '프로젝트', value: 12, icon: FileText },
    { label: '기여', value: 284, icon: GitFork },
    { label: '받은 별표', value: 567, icon: Star },
  ];

  const projects = [
    {
      id: 1,
      title: 'AI 챗봇 자동 응답 시스템',
      description: '고객 문의 자동 처리를 위한 AI 기반 챗봇 시스템. GPT-4를 활용한 자연어 처리',
      author: '김지현',
      department: 'IT기획팀',
      tags: ['Python', 'AI/ML', 'ChatGPT'],
      stars: 127,
      forks: 34,
      updatedAt: '2시간 전',
    },
    {
      id: 2,
      title: 'Slack 알림 자동화',
      description: '중요 이벤트를 Slack으로 자동 알림하는 시스템',
      author: '김지현',
      department: 'IT기획팀',
      tags: ['Node.js', 'Slack API'],
      stars: 89,
      forks: 21,
      updatedAt: '1주일 전',
    },
  ];

  const contributions = [
    { month: 'Jan', count: 45 },
    { month: 'Feb', count: 62 },
    { month: 'Mar', count: 38 },
    { month: 'Apr', count: 51 },
    { month: 'May', count: 73 },
    { month: 'Jun', count: 15 },
  ];

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <div className="bg-white border border-gray-200 rounded-xl p-8">
        <div className="flex items-start gap-6">
          <div className="w-24 h-24 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-white text-3xl font-bold">{user.name[0]}</span>
          </div>
          
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">{user.name}</h1>
            <p className="text-lg text-gray-600 mb-3">{user.role}</p>
            <p className="text-gray-700 mb-4">{user.bio}</p>
            
            <div className="flex flex-wrap gap-4 text-sm text-gray-600">
              <div className="flex items-center gap-1.5">
                <Mail className="w-4 h-4" />
                <span>{user.email}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4" />
                <span>{user.location}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                <span>가입일: {user.joinedDate}</span>
              </div>
            </div>
          </div>

          <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all text-sm font-medium">
            프로필 수정
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mt-8 pt-6 border-t border-gray-200">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <div key={index} className="text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Icon className="w-4 h-4 text-gray-500" />
                  <span className="text-2xl font-bold text-gray-900">{stat.value}</span>
                </div>
                <span className="text-sm text-gray-600">{stat.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Contribution Graph */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">기여 활동</h2>
        <div className="flex items-end gap-3 h-32">
          {contributions.map((contribution, index) => (
            <div key={index} className="flex-1 flex flex-col items-center gap-2">
              <div
                className="w-full bg-blue-500 rounded-t-lg hover:bg-blue-600 transition-all cursor-pointer"
                style={{ height: `${(contribution.count / 80) * 100}%` }}
                title={`${contribution.month}: 기여 ${contribution.count}회`}
              />
              <span className="text-xs text-gray-600">{contribution.month}</span>
            </div>
          ))}
        </div>
        <p className="text-sm text-gray-600 mt-4">
          총 <span className="font-semibold text-gray-900">284</span>개의 기여
        </p>
      </div>

      {/* Projects */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-5">작성한 프로젝트</h2>
        <div className="space-y-4">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              {...project}
              onClick={() => onProjectClick(project.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
