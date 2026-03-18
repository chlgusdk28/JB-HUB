// ARIA helpers for accessibility

export function getAriaLabel(label: string, description?: string): string {
  return description ? `${label} - ${description}` : label
}

export function getAriaCurrent(page: string, currentPage: string): boolean | 'page' {
  return page === currentPage ? 'page' : false
}

export function getAriaExpanded(isOpen: boolean): boolean {
  return isOpen
}

export function getAriaHaspopup(hasPopup: boolean): boolean | 'menu' | 'dialog' {
  return hasPopup
}

let idCounter = 0
export function generateAriaId(prefix = 'aria'): string {
  return `${prefix}-${++idCounter}`
}

export function createAriaLabelledBy(...ids: string[]): string {
  return ids.filter(Boolean).join(' ')
}

export function createAriaDescribedBy(...ids: string[]): string {
  return ids.filter(Boolean).join(' ')
}
