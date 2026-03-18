import { X } from 'lucide-react';
import { categoryOptions, techStackOptions, departmentOptions, sortOptions } from '../constants/filterOptions';

interface FilterSidebarProps {
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  selectedTechStack: string[];
  onTechStackChange: (tech: string) => void;
  selectedDepartment: string | null;
  onDepartmentChange: (dept: string | null) => void;
  sortBy: string;
  onSortChange: (sort: string) => void;
  onClearFilters: () => void;
}

export function FilterSidebar({
  selectedCategory,
  onCategoryChange,
  selectedTechStack,
  onTechStackChange,
  selectedDepartment,
  onDepartmentChange,
  sortBy,
  onSortChange,
  onClearFilters,
}: FilterSidebarProps) {
  const categories = categoryOptions;
  const techStacks = techStackOptions;
  const departments = departmentOptions;
  const sortOptionList = sortOptions;

  const hasActiveFilters = 
    selectedCategory !== 'all' || 
    selectedTechStack.length > 0 || 
    selectedDepartment !== null;

  return (
    <aside className="w-72 space-y-5">
      {/* Filter Header */}
      {hasActiveFilters && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-900">
              필터 적용 중
            </span>
            <button
              onClick={onClearFilters}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              모두 지우기
            </button>
          </div>
        </div>
      )}

      {/* Sort Options */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="font-semibold text-gray-900 mb-4 text-sm">정렬</h3>
        <div className="space-y-2">
          {sortOptions.map((option) => (
            <label
              key={option.id}
              className="flex items-center gap-3 cursor-pointer group"
            >
              <input
                type="radio"
                name="sort"
                value={option.id}
                checked={sortBy === option.id}
                onChange={() => onSortChange(option.id)}
                className="w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700 group-hover:text-gray-900">
                {option.label}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Category Filter */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="font-semibold text-gray-900 mb-4 text-sm">카테고리</h3>
        <div className="space-y-1">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => onCategoryChange(category.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-all ${
                selectedCategory === category.id
                  ? 'bg-blue-50 text-blue-600 font-medium'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span>{category.label}</span>
              <span className={`text-xs ${selectedCategory === category.id ? 'text-blue-600' : 'text-gray-500'}`}>
                {category.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Tech Stack Filter */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="font-semibold text-gray-900 mb-4 text-sm">기술 스택</h3>
        <div className="space-y-2.5">
          {techStacks.map((tech) => (
            <label
              key={tech.id}
              className="flex items-center justify-between cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedTechStack.includes(tech.id)}
                  onChange={() => onTechStackChange(tech.id)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 group-hover:text-gray-900">
                  {tech.label}
                </span>
              </div>
              <span className="text-xs text-gray-500">{tech.count}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Department Filter */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="font-semibold text-gray-900 mb-4 text-sm">부서 / 조직</h3>
        <div className="space-y-1">
          {departments.map((dept) => (
            <button
              key={dept.id}
              onClick={() => onDepartmentChange(dept.id === selectedDepartment ? null : dept.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-all ${
                selectedDepartment === dept.id
                  ? 'bg-blue-50 text-blue-600 font-medium'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span>{dept.label}</span>
              <span className={`text-xs ${selectedDepartment === dept.id ? 'text-blue-600' : 'text-gray-500'}`}>
                {dept.count}
              </span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
