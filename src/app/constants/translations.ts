// Localization constants and utilities

export const SORT_OPTIONS = ['relevance', 'stars', 'views', 'comments', 'newest'] as const
export type SortOption = typeof SORT_OPTIONS[number]

export const SORT_OPTION_LABELS: Record<SortOption, string> = {
  relevance: '관련도',
  stars: '스타 많은 순',
  views: '조회수 많은 순',
  comments: '댓글 많은 순',
  newest: '최신순',
}

export const CATEGORY_LABELS: Record<string, string> = {
  all: '전체',
  collaboration: '협업',
  'ai-search': 'AI / 검색',
  'file-share': '파일 공유',
  docs: '문서 / 위키',
  itsm: 'ITSM',
  automation: '자동화',
  'project-mgmt': '프로젝트 관리',
  devops: 'DevOps',
  analytics: '분석',
  monitoring: '모니터링',
  security: '보안',
  cms: 'CMS',
}

export const CURRENT_USER = { name: 'J. Kim', department: 'IT 디지털' }

export const DEPARTMENT_TRANSLATIONS: Record<string, string> = {
  'IT Digital': 'IT 디지털',
  'IT Platform': 'IT 플랫폼',
  'IT Support': 'IT 지원',
  'IT Security': 'IT 보안',
}

export const TIME_TRANSLATIONS: Record<string, string> = {
  '2w ago': '2주 전',
  '5d ago': '5일 전',
  '3d ago': '3일 전',
  '1mo ago': '1개월 전',
  '2h ago': '2시간 전',
  '5h ago': '5시간 전',
  '1d ago': '1일 전',
  '2d ago': '2일 전',
  '1h ago': '1시간 전',
  '55m ago': '55분 전',
  '40m ago': '40분 전',
  '4h ago': '4시간 전',
  '3h ago': '3시간 전',
  '20h ago': '20시간 전',
  '18h ago': '18시간 전',
  '22h ago': '22시간 전',
}

export const BADGE_TRANSLATIONS: Record<string, string> = {
  new: '신규',
  best: '베스트',
  hot: '인기',
}

export const TAG_TRANSLATIONS: Record<string, string> = {
  Collaboration: '협업',
  Messenger: '메신저',
  OpenSource: '오픈소스',
  Search: '검색',
  'File Share': '파일 공유',
  Documentation: '문서화',
  Knowledge: '지식',
  Helpdesk: '헬프데스크',
  Ticket: '티켓',
  Automation: '자동화',
  Workflow: '워크플로',
  Project: '프로젝트',
  Agile: '애자일',
  'Issue Tracking': '이슈 관리',
  Registry: '레지스트리',
  Visualization: '시각화',
  Analytics: '분석',
  'Data Analysis': '데이터 분석',
  Monitoring: '모니터링',
  Observability: '관측성',
  Logs: '로그',
  Analysis: '분석',
  Security: '보안',
  Authentication: '인증',
  Secret: '시크릿',
  Headless: '헤드리스',
}

export const PROJECT_TITLE_TRANSLATIONS: Record<string, string> = {
  'Mattermost Internal Chat': 'Mattermost 사내 채팅',
  'Rocket.Chat Service': 'Rocket.Chat 협업 서비스',
  'RAG Search Assistant': 'RAG 검색 어시스턴트',
  'LlamaIndex Knowledge Hub': 'LlamaIndex 지식 허브',
  'Nextcloud Drive': 'Nextcloud 드라이브',
  'Wiki.js Workspace': 'Wiki.js 워크스페이스',
  'GLPI ITSM Portal': 'GLPI ITSM 포털',
  'n8n Workflow Automation': 'n8n 워크플로 자동화',
  'Redmine PM Suite': 'Redmine PM 스위트',
  'GitLab Internal DevOps': 'GitLab 사내 DevOps',
  'Harbor Registry': 'Harbor 레지스트리',
  'Apache Superset BI': 'Apache Superset BI',
  'Metabase Data Explorer': 'Metabase 데이터 탐색기',
  'Grafana Observability': 'Grafana 관측성 대시보드',
  'ELK Log Analytics': 'ELK 로그 분석',
  'Keycloak SSO Platform': 'Keycloak SSO 플랫폼',
  'Vault Secret Manager': 'Vault 시크릿 매니저',
  'Strapi Headless CMS': 'Strapi 헤드리스 CMS',
}

export const PROJECT_DESCRIPTION_TRANSLATIONS: Record<string, string> = {
  'Self-hosted team messenger with channel-based collaboration and enterprise controls.':
    '채널 기반 협업과 엔터프라이즈 제어 기능을 제공하는 자체 호스팅 메신저입니다.',
  'Open-source messaging alternative with rich plugin support and self-host deployment.':
    '풍부한 플러그인 지원과 자체 배포가 가능한 오픈소스 메시징 대안입니다.',
  'Retrieval-augmented assistant for policy and FAQ documents with high precision search.':
    '정책 문서와 FAQ를 고정밀로 탐색하는 검색 증강형 어시스턴트입니다.',
  'Unified semantic search across PDF, Wiki, and DB sources for internal knowledge.':
    'PDF, 위키, DB를 통합해 사내 지식을 의미 기반으로 검색하는 허브입니다.',
  'Company cloud storage with secure sharing, version history, and team folders.':
    '보안 공유, 버전 이력, 팀 폴더를 제공하는 사내 클라우드 스토리지입니다.',
  'Structured documentation platform for guides, onboarding, and operations manuals.':
    '가이드, 온보딩, 운영 매뉴얼을 구조화해 관리하는 문서 플랫폼입니다.',
  'Ticketing and asset management for device, license, and support request tracking.':
    '장비, 라이선스, 지원 요청을 추적하는 티켓 및 자산 관리 포털입니다.',
  'Low-code workflow automation for notifications, approval routing, and data sync.':
    '알림, 승인 라우팅, 데이터 동기화를 자동화하는 로우코드 워크플로 도구입니다.',
  'Project planning with issue tracking, milestones, release boards, and wiki.':
    '이슈 트래킹, 마일스톤, 릴리스 보드, 위키를 포함한 프로젝트 운영 도구입니다.',
  'Code hosting with merge requests, CI pipelines, and deployment templates.':
    '머지 요청, CI 파이프라인, 배포 템플릿을 제공하는 코드 호스팅 플랫폼입니다.',
  'Private container registry with vulnerability scans and role-based access.':
    '취약점 스캔과 권한 제어를 지원하는 프라이빗 컨테이너 레지스트리입니다.',
  'Self-service dashboards for sales, operation, and customer funnel analytics.':
    '매출, 운영, 고객 퍼널을 시각화하는 셀프서비스 대시보드 플랫폼입니다.',
  'Business users can build and share dashboards without writing SQL.':
    '비개발자도 SQL 없이 대시보드를 만들고 공유할 수 있는 분석 도구입니다.',
  'Infra and API monitoring dashboards with alert routing and SLO views.':
    '인프라와 API를 모니터링하고 알림을 라우팅하는 관측성 대시보드입니다.',
  'Unified log ingestion and analysis for security events and platform incidents.':
    '보안 이벤트와 플랫폼 장애를 위한 통합 로그 수집 및 분석 스택입니다.',
  'Centralized identity and access with SSO, role mapping, and token policy.':
    'SSO, 역할 매핑, 토큰 정책을 중앙에서 관리하는 인증/인가 플랫폼입니다.',
  'Secure storage and rotation for service credentials and API keys.':
    '서비스 자격 증명과 API 키를 안전하게 저장하고 회전하는 비밀 관리 도구입니다.',
  'Headless content management with API-first delivery for web and app channels.':
    '웹과 앱 채널에 API 중심으로 콘텐츠를 제공하는 헤드리스 CMS입니다.',
}

export const DISCUSSION_TITLE_TRANSLATIONS: Record<string, string> = {
  'Mattermost rollout checklist for 1,000+ users': 'Mattermost 1,000명 배포 체크리스트',
  'How to improve RAG precision on policy documents?': '정책 문서 RAG 정확도를 높이려면?',
  'n8n weekly ops digest automation demo': 'n8n 주간 운영 리포트 자동화 데모',
  'Nextcloud vs on-prem S3 gateway for large files': '대용량 파일에서 Nextcloud vs 온프레미스 S3 게이트웨이',
  'GitLab template update announcement': 'GitLab 템플릿 업데이트 안내',
}

export const DISCUSSION_SUMMARY_TRANSLATIONS: Record<string, string> = {
  'Sharing an internal rollout checklist covering channel policy, migration, and backup strategy.':
    '채널 정책, 마이그레이션, 백업 전략을 포함한 사내 배포 체크리스트를 공유합니다.',
  'Looking for chunking and retrieval tuning ideas for multi-language policy Q&A.':
    '다국어 정책 Q&A 품질 향상을 위한 청킹 및 검색 튜닝 아이디어를 찾고 있습니다.',
  'Demo workflow for generating and posting a weekly operations digest to messenger channels.':
    '주간 운영 요약을 메신저 채널로 자동 발행하는 워크플로 예시를 공유합니다.',
  'A practical comparison from upload speed, ACL management, and backup operation points of view.':
    '업로드 속도, ACL 관리, 백업 운영 관점에서 실제 비교한 결과를 정리했습니다.',
  'We published updated CI templates with cached dependencies and reusable security jobs.':
    '캐시 의존성 및 재사용 가능한 보안 잡을 포함한 CI 템플릿을 배포했습니다.',
}

export const COMMENT_MESSAGE_TRANSLATIONS: Record<string, string> = {
  'The rollback steps are very useful. Can you share your migration timeline template?':
    '롤백 단계가 특히 유용합니다. 마이그레이션 일정 템플릿도 공유 가능할까요?',
  'Did you integrate SSO before migration or after? We are deciding sequence now.':
    'SSO는 마이그레이션 전후 중 언제 붙이셨나요? 저희도 순서를 고민 중입니다.',
  'We integrated SSO first, then migrated channels in batches by department.':
    '저희는 SSO를 먼저 적용하고, 부서 단위로 채널을 나눠 순차 이전했습니다.',
  'Try smaller chunk size with overlap and rerank with metadata filters.':
    '청크 크기를 줄이고 오버랩을 늘린 뒤 메타데이터 필터 재랭크를 같이 써보세요.',
  'Hybrid retrieval (BM25 + vector) improved precision for our FAQ index.':
    '저희 FAQ 인덱스에서는 하이브리드 검색(BM25 + 벡터)이 정확도에 효과적이었습니다.',
  'Thanks. I will test both approaches and share benchmark results.':
    '감사합니다. 두 접근 모두 테스트하고 벤치마크 결과를 공유하겠습니다.',
  'Monitor latency too, reranking can increase response time under load.':
    '재랭크를 넣으면 부하 시 응답 시간이 늘 수 있으니 지연 시간도 같이 보세요.',
  'Would like to reuse this in support reporting. Please post exported workflow JSON.':
    '지원 리포팅에도 재사용하고 싶습니다. 익스포트된 워크플로 JSON 부탁드립니다.',
  'I will post it with env variable placeholders tomorrow.':
    '내일 환경 변수 플레이스홀더와 함께 올려두겠습니다.',
  'How did you handle immutable backup snapshots on both options?':
    '두 옵션에서 불변 백업 스냅샷은 어떤 방식으로 처리하셨나요?',
  'We used object lock on S3 side and scheduled snapshot verification for Nextcloud.':
    'S3 쪽은 오브젝트 락, Nextcloud는 스냅샷 검증 스케줄로 운영했습니다.',
  'Template update reduced build times by around 30% in our registry pipeline.':
    '템플릿 업데이트 후 저희 레지스트리 파이프라인 빌드 시간이 약 30% 줄었습니다.',
}

// Translation utilities
export function translateText(value: string, dictionary: Record<string, string>) {
  return dictionary[value] ?? value
}

export type { Project } from '../lib/project-utils'

export function localizeProject(project: Project): Project {
  return {
    ...project,
    title: translateText(project.title, PROJECT_TITLE_TRANSLATIONS),
    description: translateText(project.description, PROJECT_DESCRIPTION_TRANSLATIONS),
    department: translateText(project.department, DEPARTMENT_TRANSLATIONS),
    tags: project.tags.map((tag) => translateText(tag, TAG_TRANSLATIONS)),
    createdAt: project.createdAt ? translateText(project.createdAt, TIME_TRANSLATIONS) : project.createdAt,
    badge: project.badge ? translateText(project.badge, BADGE_TRANSLATIONS) : project.badge,
  }
}

export type { DiscussionPost, DiscussionComment } from '../data/discussions'

export function localizeDiscussion(discussion: DiscussionPost): DiscussionPost {
  return {
    ...discussion,
    title: translateText(discussion.title, DISCUSSION_TITLE_TRANSLATIONS),
    summary: translateText(discussion.summary, DISCUSSION_SUMMARY_TRANSLATIONS),
    department: translateText(discussion.department, DEPARTMENT_TRANSLATIONS),
    tags: discussion.tags.map((tag) => translateText(tag, TAG_TRANSLATIONS)),
    createdAt: translateText(discussion.createdAt, TIME_TRANSLATIONS),
  }
}

export function localizeDiscussionComment(comment: DiscussionComment): DiscussionComment {
  return {
    ...comment,
    department: translateText(comment.department, DEPARTMENT_TRANSLATIONS),
    message: translateText(comment.message, COMMENT_MESSAGE_TRANSLATIONS),
    createdAt: translateText(comment.createdAt, TIME_TRANSLATIONS),
  }
}
