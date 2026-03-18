interface CategoryFilterButtonProps {
  label: string
  count: number
  isActive: boolean
  onClick: () => void
}

export function CategoryFilterButton({ label, count, isActive, onClick }: CategoryFilterButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`category-filter-button chip-filter ${isActive ? 'chip-filter-active' : 'chip-filter-idle'}`}
      aria-pressed={isActive}
    >
      <span className="category-filter-label">{label}</span>
      <span className={`category-filter-count ${isActive ? 'category-filter-count-active' : ''}`}>{count}</span>
    </button>
  )
}
