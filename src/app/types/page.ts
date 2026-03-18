export type PageId =
  | 'home'
  | 'ranking'
  | 'projects'
  | 'project-detail'
  | 'community'
  | 'discussion-detail'
  | 'workspace'
  | 'profile'

export type ProjectCardDensity = 'comfortable' | 'compact'
export type UserRole = 'viewer' | 'contributor' | 'maintainer' | 'admin'

export interface CurrentUser {
  id: string
  name: string
  department: string
  role: UserRole
}
