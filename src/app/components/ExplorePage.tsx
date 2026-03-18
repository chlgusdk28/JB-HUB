import { useState, useMemo, useEffect } from 'react';
import { ProjectCard } from './ProjectCard';
import { FilterSidebar } from './FilterSidebar';
import { ExploreHeader } from './ExploreHeader';
import { mockProjects, ITEMS_PER_PAGE, MAX_VISIBLE_PAGES } from '../constants/mockProjects';
import { useDebounce } from '../hooks/useDebounce';
import { useFilterPersistence, clearStoredFilters } from '../hooks/useFilterPersistence';

interface ExplorePageProps {
  onProjectClick: (projectId: number) => void;
}

export function ExplorePage({ onProjectClick }: ExplorePageProps) {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedTechStack, setSelectedTechStack] = useState<string[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState('latest');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [currentPage, setCurrentPage] = useState(1);
  const [filtersInitialized, setFiltersInitialized] = useState(false);
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Create filters object for persistence
  const filters = useMemo(() => ({
    category: selectedCategory,
    techStack: selectedTechStack,
    department: selectedDepartment,
    sortBy: searchQuery ? 'relevance' : sortBy,
  }), [selectedCategory, selectedTechStack, selectedDepartment, sortBy, searchQuery]);

  // Restore filters on mount (only once)
  useEffect(() => {
    try {
      const stored = localStorage.getItem('jbhub-explore-filters');
      if (stored) {
        const savedFilters = JSON.parse(stored);
        if (savedFilters.category) setSelectedCategory(savedFilters.category);
        if (savedFilters.techStack) setSelectedTechStack(savedFilters.techStack);
        if (savedFilters.department !== undefined) setSelectedDepartment(savedFilters.department);
        if (savedFilters.sortBy && !searchQuery) setSortBy(savedFilters.sortBy);
      }
    } catch {
      // Ignore
    }
    setFiltersInitialized(true);
  }, []);

  // Save filters whenever they change (after initialization)
  useEffect(() => {
    if (!filtersInitialized) return;
    try {
      localStorage.setItem('jbhub-explore-filters', JSON.stringify({
        category: selectedCategory,
        techStack: selectedTechStack,
        department: selectedDepartment,
        sortBy: searchQuery ? 'relevance' : sortBy,
      }));
    } catch {
      // Ignore
    }
  }, [selectedCategory, selectedTechStack, selectedDepartment, sortBy, searchQuery, filtersInitialized]);

  const handleTechStackChange = (tech: string) => {
    setSelectedTechStack((prev) =>
      prev.includes(tech) ? prev.filter((t) => t !== tech) : [...prev, tech]
    );
  };

  const handleClearFilters = () => {
    setSelectedCategory('all');
    setSelectedTechStack([]);
    setSelectedDepartment(null);
    setCurrentPage(1);
    try {
      localStorage.removeItem('jbhub-explore-filters');
    } catch {
      // Ignore
    }
  };

  // Filter and pagination
  const filteredProjects = useMemo(() => {
    return mockProjects.filter((project) => {
      const matchesCategory = selectedCategory === 'all' || true; // Add category filtering logic
      const matchesTech = selectedTechStack.length === 0 || selectedTechStack.some(t => project.tags.includes(t));
      const matchesDept = !selectedDepartment || project.department === selectedDepartment;
      const matchesSearch = !debouncedSearchQuery || project.title.toLowerCase().includes(debouncedSearchQuery.toLowerCase());
      return matchesCategory && matchesTech && matchesDept && matchesSearch;
    });
  }, [selectedCategory, selectedTechStack, selectedDepartment, debouncedSearchQuery]);

  const totalPages = Math.ceil(filteredProjects.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedProjects = filteredProjects.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useMemo(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [currentPage, totalPages]);

  // Pagination page numbers
  const getPageNumbers = () => {
    const pages: number[] = [];
    let startPage = Math.max(1, currentPage - Math.floor(MAX_VISIBLE_PAGES / 2));
    let endPage = Math.min(totalPages, startPage + MAX_VISIBLE_PAGES - 1);

    if (endPage - startPage + 1 < MAX_VISIBLE_PAGES) {
      startPage = Math.max(1, endPage - MAX_VISIBLE_PAGES + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  };

  return (
    <div className="flex gap-6">
      {/* Left Sidebar - Filters */}
      <FilterSidebar
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        selectedTechStack={selectedTechStack}
        onTechStackChange={handleTechStackChange}
        selectedDepartment={selectedDepartment}
        onDepartmentChange={setSelectedDepartment}
        sortBy={sortBy}
        onSortChange={setSortBy}
        onClearFilters={handleClearFilters}
      />

      {/* Main Content */}
      <div className="flex-1 space-y-6">
        {/* Search & Header */}
        <ExploreHeader
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedTechStack={selectedTechStack}
          onRemoveTech={(tech) => handleTechStackChange(tech)}
          selectedDepartment={selectedDepartment}
          onRemoveDepartment={() => setSelectedDepartment(null)}
          totalResults={filteredProjects.length}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          isSearching={searchQuery !== debouncedSearchQuery}
        />

        {/* Projects Grid/List */}
        <div className={viewMode === 'grid' ? 'grid grid-cols-1 lg:grid-cols-2 gap-5' : 'space-y-4'}>
          {paginatedProjects.map((project) => (
            <ProjectCard
              key={project.id}
              {...project}
              onClick={() => onProjectClick(project.id)}
            />
          ))}
        </div>

        {/* Empty State */}
        {filteredProjects.length === 0 && (
          <div className="empty-panel">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">🔍</span>
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
              검색 결과가 없습니다
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              다른 검색어나 필터를 시도해보세요
            </p>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-4">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              이전
            </button>
            {getPageNumbers().map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  currentPage === page
                    ? 'bg-blue-600 text-white'
                    : 'border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              다음
            </button>
          </div>
        )}
      </div>
    </div>
  );
}