interface QuietFilterProps {
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  selectedTags: string[];
  onTagToggle: (tag: string) => void;
}

export function QuietFilter({
  selectedCategory,
  onCategoryChange,
  selectedTags,
  onTagToggle,
}: QuietFilterProps) {
  const categories = [
    { id: 'all', label: '전체' },
    { id: 'ai', label: 'AI/ML' },
    { id: 'automation', label: '자동화' },
    { id: 'web', label: '웹' },
    { id: 'data', label: '데이터' },
  ];

  const tags = [
    'Python',
    'JavaScript',
    'TypeScript',
    'React',
    'Node.js',
  ];

  return (
    <div className="space-y-12">
      {/* Category */}
      <div className="space-y-3">
        <div className="text-xs text-gray-400 mb-4">카테고리</div>
        {categories.map((category) => (
          <button
            key={category.id}
            onClick={() => onCategoryChange(category.id)}
            className={`block w-full text-left text-sm transition-colors ${
              selectedCategory === category.id
                ? 'text-gray-900'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {category.label}
          </button>
        ))}
      </div>

      {/* Tags */}
      <div className="space-y-3">
        <div className="text-xs text-gray-400 mb-4">기술</div>
        {tags.map((tag) => {
          const isSelected = selectedTags.includes(tag);
          return (
            <button
              key={tag}
              onClick={() => onTagToggle(tag)}
              className={`block w-full text-left text-sm transition-colors ${
                isSelected
                  ? 'text-gray-900'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}
