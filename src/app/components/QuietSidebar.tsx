import { Home, Compass, FolderGit2, MessageSquare, User } from 'lucide-react';

interface QuietSidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

export function QuietSidebar({ currentPage, onNavigate }: QuietSidebarProps) {
  const menuItems = [
    { id: 'home', label: '홈', icon: Home },
    { id: 'explore', label: '탐색', icon: Compass },
    { id: 'projects', label: '프로젝트', icon: FolderGit2 },
    { id: 'community', label: '토론', icon: MessageSquare },
    { id: 'workspace', label: '작업공간', icon: User },
  ];

  return (
    <aside className="w-56 h-screen fixed left-0 top-24 px-8 py-12">
      <nav className="space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                isActive
                  ? 'text-gray-900'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" strokeWidth={1.5} />
              <span className="text-sm">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
