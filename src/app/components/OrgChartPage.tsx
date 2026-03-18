import { useMemo, useState } from 'react'
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Link2,
  MapPin,
  Network,
  Search,
  Users,
  UserSquare2,
} from 'lucide-react'
import { OpalCard } from './opal/OpalCard'
import { OpalInput } from './opal/OpalInput'
import { OpalButton } from './opal/OpalButton'

type OrgViewMode = 'tree' | 'directory'

interface OrgNode {
  id: string
  name: string
  leader: string
  leaderRole: string
  division: string
  location: string
  memberCount: number
  openRoles: number
  description: string
  children: OrgNode[]
}

const ORG_TREE: OrgNode[] = [
  {
    id: 'jb-hq',
    name: 'JB-HUB 본사',
    leader: '한지민',
    leaderRole: 'CEO',
    division: '경영',
    location: '서울 강남',
    memberCount: 148,
    openRoles: 2,
    description: '제품 전략과 사업, 기술 조직을 통합 운영하는 본사 조직입니다.',
    children: [
      {
        id: 'strategy-office',
        name: '전략기획실',
        leader: '김세린',
        leaderRole: 'Chief Strategy Officer',
        division: '경영',
        location: '서울 강남',
        memberCount: 14,
        openRoles: 1,
        description: '중장기 로드맵, 예산, KPI 운영 체계를 책임집니다.',
        children: [
          {
            id: 'biz-planning-team',
            name: '사업기획팀',
            leader: '조민준',
            leaderRole: '팀장',
            division: '경영',
            location: '서울 강남',
            memberCount: 7,
            openRoles: 1,
            description: '신규 사업 검토, 수익성 분석, 분기 목표 수립을 담당합니다.',
            children: [],
          },
          {
            id: 'performance-team',
            name: '성과관리팀',
            leader: '서유림',
            leaderRole: '팀장',
            division: '경영',
            location: '서울 강남',
            memberCount: 7,
            openRoles: 0,
            description: '조직 KPI, OKR 리뷰, 실행 리포팅을 운영합니다.',
            children: [],
          },
        ],
      },
      {
        id: 'platform-division',
        name: '플랫폼개발본부',
        leader: '박도윤',
        leaderRole: 'CTO',
        division: '플랫폼',
        location: '서울 강남',
        memberCount: 56,
        openRoles: 3,
        description: '사내 서비스 플랫폼과 핵심 제품 개발을 총괄합니다.',
        children: [
          {
            id: 'frontend-team',
            name: '프론트엔드팀',
            leader: '윤하은',
            leaderRole: '팀장',
            division: '플랫폼',
            location: '서울 강남',
            memberCount: 18,
            openRoles: 1,
            description: '웹 애플리케이션 UX와 디자인 시스템을 개발합니다.',
            children: [],
          },
          {
            id: 'backend-team',
            name: '백엔드팀',
            leader: '정태훈',
            leaderRole: '팀장',
            division: '플랫폼',
            location: '서울 강남',
            memberCount: 21,
            openRoles: 1,
            description: '도메인 API, 인증, 권한, 데이터 모델을 관리합니다.',
            children: [],
          },
          {
            id: 'data-platform-team',
            name: '데이터플랫폼팀',
            leader: '강다윤',
            leaderRole: '팀장',
            division: '플랫폼',
            location: '서울 강남',
            memberCount: 17,
            openRoles: 1,
            description: '데이터 파이프라인, 분석 환경, 추천 모델을 구축합니다.',
            children: [],
          },
        ],
      },
      {
        id: 'infra-security-division',
        name: '인프라·보안본부',
        leader: '이건우',
        leaderRole: 'Head of Infra & Security',
        division: '인프라/보안',
        location: '서울 강남',
        memberCount: 34,
        openRoles: 2,
        description: '클라우드 운영, 보안, 안정성 엔지니어링을 담당합니다.',
        children: [
          {
            id: 'infra-team',
            name: '인프라팀',
            leader: '오민재',
            leaderRole: '팀장',
            division: '인프라/보안',
            location: '서울 강남',
            memberCount: 13,
            openRoles: 1,
            description: '배포/운영 자동화, 네트워크, 비용 최적화를 담당합니다.',
            children: [],
          },
          {
            id: 'security-team',
            name: '보안팀',
            leader: '문지후',
            leaderRole: '팀장',
            division: '인프라/보안',
            location: '서울 강남',
            memberCount: 11,
            openRoles: 0,
            description: '접근통제, 취약점 대응, 감사 로그 정책을 운영합니다.',
            children: [],
          },
          {
            id: 'sre-team',
            name: 'SRE팀',
            leader: '임세아',
            leaderRole: '팀장',
            division: '인프라/보안',
            location: '서울 강남',
            memberCount: 10,
            openRoles: 1,
            description: '서비스 가용성, 성능, 장애 대응 체계를 구축합니다.',
            children: [],
          },
        ],
      },
      {
        id: 'business-division',
        name: '사업성장본부',
        leader: '정연우',
        leaderRole: 'Chief Business Officer',
        division: '사업',
        location: '서울 강남',
        memberCount: 44,
        openRoles: 4,
        description: '사업개발, 고객성공, 디자인/브랜딩을 총괄합니다.',
        children: [
          {
            id: 'biz-dev-team',
            name: '사업개발팀',
            leader: '신예린',
            leaderRole: '팀장',
            division: '사업',
            location: '서울 강남',
            memberCount: 15,
            openRoles: 2,
            description: '신규 파트너십, 제안서, 매출 파이프라인을 운영합니다.',
            children: [],
          },
          {
            id: 'customer-success-team',
            name: '고객성공팀',
            leader: '홍서준',
            leaderRole: '팀장',
            division: '사업',
            location: '서울 강남',
            memberCount: 16,
            openRoles: 1,
            description: '도입 이후 성과관리와 고객 운영 안정화를 지원합니다.',
            children: [],
          },
          {
            id: 'design-brand-team',
            name: '디자인브랜드팀',
            leader: '유수민',
            leaderRole: '팀장',
            division: '사업',
            location: '서울 강남',
            memberCount: 13,
            openRoles: 1,
            description: '서비스 UX, 브랜드 톤, 캠페인 디자인을 수행합니다.',
            children: [],
          },
        ],
      },
    ],
  },
]

function flattenOrgTree(nodes: OrgNode[]): OrgNode[] {
  return nodes.flatMap((node) => [node, ...flattenOrgTree(node.children)])
}

function countLeafOpenRoles(nodes: OrgNode[]): number {
  return nodes.reduce((accumulator, node) => {
    if (node.children.length === 0) {
      return accumulator + node.openRoles
    }
    return accumulator + countLeafOpenRoles(node.children)
  }, 0)
}

function filterOrgTree(
  nodes: OrgNode[],
  options: {
    search: string
    division: string
    openRolesOnly: boolean
  },
): OrgNode[] {
  const normalizedQuery = options.search.trim().toLowerCase()

  const matches = (node: OrgNode): boolean => {
    const divisionMatched = options.division === '전체' || node.division === options.division
    const openRoleMatched = !options.openRolesOnly || node.openRoles > 0

    if (!normalizedQuery) {
      return divisionMatched && openRoleMatched
    }

    const queryMatched =
      node.name.toLowerCase().includes(normalizedQuery) ||
      node.leader.toLowerCase().includes(normalizedQuery) ||
      node.leaderRole.toLowerCase().includes(normalizedQuery) ||
      node.description.toLowerCase().includes(normalizedQuery)

    return divisionMatched && openRoleMatched && queryMatched
  }

  return nodes
    .map((node) => {
      const filteredChildren = filterOrgTree(node.children, options)
      if (matches(node) || filteredChildren.length > 0) {
        return {
          ...node,
          children: filteredChildren,
        }
      }
      return null
    })
    .filter((node): node is OrgNode => node !== null)
}

function collectNodeIds(nodes: OrgNode[]): string[] {
  return nodes.flatMap((node) => [node.id, ...collectNodeIds(node.children)])
}

function findNodeById(nodes: OrgNode[], nodeId: string): OrgNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node
    }
    const childMatch = findNodeById(node.children, nodeId)
    if (childMatch) {
      return childMatch
    }
  }
  return null
}

function getDepth(nodeId: string, nodes: OrgNode[], depth = 0): number | null {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return depth
    }
    const childDepth = getDepth(nodeId, node.children, depth + 1)
    if (childDepth !== null) {
      return childDepth
    }
  }
  return null
}

export function OrgChartPage() {
  const [query, setQuery] = useState('')
  const [selectedDivision, setSelectedDivision] = useState('전체')
  const [openRolesOnly, setOpenRolesOnly] = useState(false)
  const [viewMode, setViewMode] = useState<OrgViewMode>('tree')
  const [selectedNodeId, setSelectedNodeId] = useState<string>('jb-hq')
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(
    () => new Set(['jb-hq', 'strategy-office', 'platform-division', 'infra-security-division', 'business-division']),
  )

  const rootNode = ORG_TREE[0]

  const allNodes = useMemo(() => flattenOrgTree(ORG_TREE), [])

  const divisionOptions = useMemo(
    () => ['전체', ...Array.from(new Set(allNodes.map((node) => node.division))).sort((a, b) => a.localeCompare(b))],
    [allNodes],
  )

  const filteredTree = useMemo(
    () =>
      filterOrgTree(ORG_TREE, {
        search: query,
        division: selectedDivision,
        openRolesOnly,
      }),
    [query, selectedDivision, openRolesOnly],
  )

  const filteredNodeIds = useMemo(() => new Set(collectNodeIds(filteredTree)), [filteredTree])

  const filteredDirectory = useMemo(() => flattenOrgTree(filteredTree), [filteredTree])

  const selectedNode = useMemo(() => {
    if (filteredNodeIds.has(selectedNodeId)) {
      return findNodeById(filteredTree, selectedNodeId)
    }
    return filteredDirectory[0] ?? null
  }, [filteredDirectory, filteredNodeIds, filteredTree, selectedNodeId])

  const selectedNodeDepth = useMemo(() => {
    if (!selectedNode) {
      return null
    }
    return getDepth(selectedNode.id, ORG_TREE)
  }, [selectedNode])

  const totalOrganizationCount = allNodes.length
  const totalLeafOpenRoles = countLeafOpenRoles(ORG_TREE)

  const toggleExpanded = (nodeId: string) => {
    setExpandedNodeIds((previous) => {
      const next = new Set(previous)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }

  const expandAll = () => {
    setExpandedNodeIds(new Set(collectNodeIds(filteredTree)))
  }

  const collapseAll = () => {
    setExpandedNodeIds(new Set(['jb-hq']))
  }

  const resetFilters = () => {
    setQuery('')
    setSelectedDivision('전체')
    setOpenRolesOnly(false)
  }

  const renderTreeNode = (node: OrgNode, depth = 0) => {
    const hasChildren = node.children.length > 0
    const isExpanded = expandedNodeIds.has(node.id)
    const isSelected = selectedNode?.id === node.id
    const childGroupId = `org-node-children-${node.id}`

    return (
      <div
        key={node.id}
        className="space-y-2"
        style={{ paddingLeft: `${depth * 16}px` }}
        role="treeitem"
        aria-level={depth + 1}
        aria-selected={isSelected}
        aria-expanded={hasChildren ? isExpanded : undefined}
      >
        <OpalCard padding="compact" elevation={isSelected ? 'low' : 'minimal'}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-center gap-2">
                {hasChildren ? (
                  <button
                    type="button"
                    onClick={() => toggleExpanded(node.id)}
                    aria-label={isExpanded ? '하위 조직 접기' : '하위 조직 펼치기'}
                    aria-expanded={isExpanded}
                    aria-controls={childGroupId}
                    className="glass-inline-button !rounded-xl !px-2.5 !py-1"
                  >
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                ) : (
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-400">
                    <ChevronRight className="h-4 w-4" />
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedNodeId(node.id)}
                  className="truncate text-left text-lg font-semibold text-slate-900 transition hover:text-[#0f4f66]"
                  aria-pressed={isSelected}
                >
                  {node.name}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1">
                  <UserSquare2 className="h-3.5 w-3.5" />
                  {node.leader} · {node.leaderRole}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1">
                  <Users className="h-3.5 w-3.5" />
                  {node.memberCount}명
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {node.location}
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-1 font-semibold ${
                    node.openRoles > 0 ? 'bg-sky-100 text-sky-700' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {node.openRoles > 0 ? `채용 ${node.openRoles}` : '채용 완료'}
                </span>
              </div>
            </div>
          </div>
        </OpalCard>
        {hasChildren && isExpanded ? (
          <div id={childGroupId} role="group" className="space-y-2">
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="page-shell">
      <header className="hero-panel">
        <div className="floating-orb-hero-right" aria-hidden="true" />
        <div className="floating-orb-hero-left" aria-hidden="true" />
        <div className="relative z-10 space-y-4">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/12 px-3 py-1 text-xs font-semibold tracking-[0.08em] text-slate-100/95">
            <Network className="h-3.5 w-3.5" />
            Org Hub
          </p>
          <h1 className="text-2xl font-bold text-white sm:text-3xl lg:text-4xl">사내 조직도</h1>
          <p className="max-w-3xl text-sm text-slate-100/90 sm:text-base">
            조직 구조, 리더, 인원, 채용 상태를 한 화면에서 확인할 수 있습니다. API 연계 전까지는 샘플 데이터로 동작하며,
            연계 후에는 실시간 조직 변경 사항을 바로 반영할 수 있도록 설계했습니다.
          </p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="knowledge-kpi-card">
              <p className="knowledge-kpi-label">총 인원</p>
              <p className="knowledge-kpi-value">{rootNode.memberCount}</p>
            </div>
            <div className="knowledge-kpi-card">
              <p className="knowledge-kpi-label">조직 단위</p>
              <p className="knowledge-kpi-value">{totalOrganizationCount}</p>
            </div>
            <div className="knowledge-kpi-card">
              <p className="knowledge-kpi-label">채용 포지션</p>
              <p className="knowledge-kpi-value">{totalLeafOpenRoles}</p>
            </div>
            <div className="knowledge-kpi-card">
              <p className="knowledge-kpi-label">조회 결과</p>
              <p className="knowledge-kpi-value">{filteredDirectory.length}</p>
            </div>
          </div>
        </div>
      </header>

      <section className="filter-panel space-y-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_14rem_12rem]">
          <OpalInput
            value={query}
            onChange={setQuery}
            placeholder="조직명, 리더명, 직책, 설명으로 검색"
            variant="filled"
            icon={<Search className="h-4 w-4" />}
            showClearButton
            ariaLabel="조직도 검색"
            autoComplete="off"
          />
          <label className="space-y-1">
            <span className="field-label">조직 구분</span>
            <select
              className="select-soft"
              value={selectedDivision}
              onChange={(event) => setSelectedDivision(event.target.value)}
            >
              {divisionOptions.map((division) => (
                <option key={division} value={division}>
                  {division}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="field-label">보기 방식</span>
            <select
              className="select-soft"
              value={viewMode}
              onChange={(event) => setViewMode(event.target.value as OrgViewMode)}
            >
              <option value="tree">트리 보기</option>
              <option value="directory">목록 보기</option>
            </select>
          </label>
        </div>

        <div className="action-row">
          <button
            type="button"
            onClick={() => setOpenRolesOnly((previous) => !previous)}
            className={`chip-filter ${openRolesOnly ? 'chip-filter-active' : 'chip-filter-idle'}`}
          >
            채용 중 조직만
          </button>
          <OpalButton size="sm" variant="secondary" onClick={expandAll}>
            전체 펼치기
          </OpalButton>
          <OpalButton size="sm" variant="secondary" onClick={collapseAll}>
            상위만 보기
          </OpalButton>
          <OpalButton size="sm" variant="ghost" onClick={resetFilters}>
            필터 초기화
          </OpalButton>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-3">
          {filteredTree.length > 0 ? (
            viewMode === 'tree' ? (
              <div role="tree" aria-label="사내 조직도 트리" className="space-y-3">
                {filteredTree.map((node) => renderTreeNode(node))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {filteredDirectory.map((node) => {
                  const isSelected = selectedNode?.id === node.id
                  return (
                    <OpalCard key={node.id} padding="compact" elevation={isSelected ? 'low' : 'minimal'}>
                      <button type="button" onClick={() => setSelectedNodeId(node.id)} className="w-full space-y-2 text-left">
                        <p className="truncate text-lg font-semibold text-slate-900">{node.name}</p>
                        <p className="text-sm text-slate-600">
                          {node.leader} · {node.leaderRole}
                        </p>
                        <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                          <span className="rounded-full border border-slate-200 bg-white px-2 py-1">{node.division}</span>
                          <span className="rounded-full border border-slate-200 bg-white px-2 py-1">인원 {node.memberCount}</span>
                          <span
                            className={`rounded-full px-2 py-1 font-semibold ${
                              node.openRoles > 0 ? 'bg-sky-100 text-sky-700' : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {node.openRoles > 0 ? `채용 ${node.openRoles}` : '채용 완료'}
                          </span>
                        </div>
                      </button>
                    </OpalCard>
                  )
                })}
              </div>
            )
          ) : (
            <div className="empty-panel">
              <p className="mb-2 text-sm text-slate-700">조건에 맞는 조직이 없습니다.</p>
              <p className="text-xs text-slate-500">검색어를 줄이거나 조직 구분 필터를 변경해보세요.</p>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <OpalCard padding="comfortable" elevation="minimal">
            <div className="space-y-3">
              <p className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.05em] text-slate-500">
                <Building2 className="h-4 w-4" />
                선택 조직 상세
              </p>
              {selectedNode ? (
                <>
                  <h2 className="text-2xl font-bold text-slate-900">{selectedNode.name}</h2>
                  <p className="text-sm text-slate-600">{selectedNode.description}</p>
                  <div className="space-y-2 text-sm text-slate-700">
                    <p>
                      리더: <span className="font-semibold text-slate-900">{selectedNode.leader}</span> ({selectedNode.leaderRole})
                    </p>
                    <p>
                      조직 구분: <span className="font-semibold text-slate-900">{selectedNode.division}</span>
                    </p>
                    <p>
                      위치: <span className="font-semibold text-slate-900">{selectedNode.location}</span>
                    </p>
                    <p>
                      인원/채용: <span className="font-semibold text-slate-900">{selectedNode.memberCount}명</span> /{' '}
                      <span className="font-semibold text-slate-900">{selectedNode.openRoles}포지션</span>
                    </p>
                    <p>
                      깊이 레벨: <span className="font-semibold text-slate-900">{selectedNodeDepth ?? '-'}단계</span>
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-600">왼쪽에서 조직을 선택하면 상세 정보가 표시됩니다.</p>
              )}
            </div>
          </OpalCard>

          <OpalCard padding="comfortable" elevation="minimal">
            <div className="space-y-3">
              <p className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.05em] text-slate-500">
                <Link2 className="h-4 w-4" />
                연계 준비 상태
              </p>
              <ul className="space-y-2 text-sm text-slate-700">
                <li className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  1. 사번/조직코드 기준의 단일 조직도 API를 연결하면 자동 동기화됩니다.
                </li>
                <li className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  2. 팀 이동, 겸직, 직책 변경 이벤트를 일 단위로 수집해 이력 추적이 가능합니다.
                </li>
                <li className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  3. 관리자 권한과 연계하면 조직 편집/잠금 정책을 운영할 수 있습니다.
                </li>
              </ul>
            </div>
          </OpalCard>
        </div>
      </section>
    </div>
  )
}
