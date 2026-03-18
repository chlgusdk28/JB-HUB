import { Search } from 'lucide-react'
import { memo, type RefObject } from 'react'
import { OpalInput } from '../opal'

interface ProjectSearchInputProps {
  id: string
  value: string
  onChange: (value: string) => void
  inputRef: RefObject<HTMLInputElement | null>
  shortcutHint?: string
}

function ProjectSearchInputBase({ id, value, onChange, inputRef, shortcutHint }: ProjectSearchInputProps) {
  return (
    <OpalInput
      id={id}
      value={value}
      onChange={onChange}
      placeholder="제목, 작성자, 부서, 태그로 검색..."
      variant="filled"
      icon={<Search className="h-4 w-4" />}
      inputRef={inputRef}
      showClearButton
      shortcutHint={shortcutHint}
      ariaLabel="프로젝트 검색"
    />
  )
}

export const ProjectSearchInput = memo(ProjectSearchInputBase)
ProjectSearchInput.displayName = 'ProjectSearchInput'
