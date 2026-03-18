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
      className={`chip-filter ${isActive ? 'chip-filter-active' : 'chip-filter-idle'}`}
    >
      {label} ({count})
    </button>
  )
}
