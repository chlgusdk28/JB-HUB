import { Home, Compass, FolderGit2, MessageSquare, User, FileText, Settings } from 'lucide-react';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  isAdmin?: boolean;
}

export function Sidebar({ currentPage, onNavigate, isAdmin = true }: SidebarProps) {
  const menuItems = [
    { id: 'home', label: '홈', icon: Home },
    { id: 'explore', label: '탐색', icon: Compass },
    { id: 'projects', label: '프로젝트', icon: FolderGit2 },
    { id: 'community', label: '토론 / 커뮤니티', icon: MessageSquare },
    { id: 'workspace', label: '내 작업공간', icon: User },
    { id: 'docs', label: '문서', icon: FileText },
  ];

  if (isAdmin) {
    menuItems.push({ id: 'admin', label: '관리자', icon: Settings });
  }

  return (
    <aside className="w-64 bg-white border-r border-gray-200 h-screen fixed left-0 top-16 overflow-y-auto">
      <nav className="p-4 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all ${
                isActive
                  ? 'bg-blue-50 text-blue-600 font-medium'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-sm">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
