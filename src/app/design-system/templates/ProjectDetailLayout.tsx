import { ReactNode } from 'react';

interface ProjectDetailLayoutProps {
  header: ReactNode;
  projectHeader: ReactNode;
  tabs: ReactNode;
  content: ReactNode;
}

export function ProjectDetailLayout({
  header,
  projectHeader,
  tabs,
  content,
}: ProjectDetailLayoutProps) {
  return (
    <div className="min-h-screen bg-[#FAFBFC]">
      {/* Global Header */}
      {header}

      {/* Main */}
      <main className="mt-20">
        <div className="max-w-5xl mx-auto px-16 py-16 space-y-16">
          {/* Project Header */}
          {projectHeader}

          {/* Tabs */}
          {tabs}

          {/* Content */}
          <div className="pb-32">
            {content}
          </div>
        </div>
      </main>
    </div>
  );
}
