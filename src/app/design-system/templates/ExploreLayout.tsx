import { ReactNode } from 'react';

interface ExploreLayoutProps {
  header: ReactNode;
  filters: ReactNode;
  content: ReactNode;
}

export function ExploreLayout({ header, filters, content }: ExploreLayoutProps) {
  return (
    <div className="min-h-screen bg-[#FAFBFC]">
      {/* Header */}
      {header}

      {/* Main */}
      <main className="mt-20">
        <div className="max-w-6xl mx-auto px-16 py-16">
          <div className="flex gap-20">
            {/* Filters */}
            <aside className="w-40 flex-shrink-0">
              {filters}
            </aside>

            {/* Content */}
            <div className="flex-1">
              {content}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
