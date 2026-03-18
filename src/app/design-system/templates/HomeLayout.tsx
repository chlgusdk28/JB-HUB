import { ReactNode } from 'react';

interface HomeLayoutProps {
  header: ReactNode;
  sidebar: ReactNode;
  content: ReactNode;
}

export function HomeLayout({ header, sidebar, content }: HomeLayoutProps) {
  return (
    <div className="min-h-screen bg-[#FAFBFC]">
      {/* Header */}
      {header}

      {/* Main */}
      <div className="flex">
        {/* Sidebar */}
        {sidebar}

        {/* Content */}
        <main className="ml-56 mt-20 flex-1">
          <div className="max-w-4xl mx-auto px-16 py-16">
            {content}
          </div>
        </main>
      </div>
    </div>
  );
}
