export type DiscussionCategory = 'Question' | 'How-To' | 'Showcase' | 'Comparison' | 'Announcement'

export interface DiscussionPost {
  id: number
  projectId?: number
  title: string
  summary: string
  author: string
  department: string
  category: DiscussionCategory
  tags: string[]
  likes: number
  views: number
  comments: number
  createdAt: string
  isHot?: boolean
}

export interface DiscussionComment {
  id: number
  author: string
  department: string
  message: string
  createdAt: string
  likes: number
}

export const DISCUSSION_CATEGORIES: DiscussionCategory[] = [
  'Question',
  'How-To',
  'Showcase',
  'Comparison',
  'Announcement',
]

export const initialDiscussions: DiscussionPost[] = [
  {
    id: 101,
    projectId: 1,
    title: 'Mattermost 1,000명 배포 체크리스트',
    summary: '채널 정책, 마이그레이션, 백업 전략을 포함한 사내 배포 체크리스트를 공유합니다.',
    author: 'J. Kim',
    department: 'IT 디지털',
    category: 'How-To',
    tags: ['Mattermost', '협업'],
    likes: 28,
    views: 412,
    comments: 3,
    createdAt: '2시간 전',
    isHot: true,
  },
  {
    id: 102,
    projectId: 3,
    title: '정책 문서 RAG 정확도를 높이려면?',
    summary: '다국어 정책 Q&A 품질 향상을 위한 청킹 및 검색 튜닝 아이디어를 찾고 있습니다.',
    author: 'H. Lee',
    department: 'AX',
    category: 'Question',
    tags: ['RAG', '검색', 'AI'],
    likes: 34,
    views: 539,
    comments: 4,
    createdAt: '5시간 전',
    isHot: true,
  },
  {
    id: 103,
    projectId: 8,
    title: 'n8n 주간 운영 리포트 자동화 데모',
    summary: '주간 운영 요약을 메신저 채널로 자동 발행하는 워크플로 예시를 공유합니다.',
    author: 'A. Choi',
    department: 'AX',
    category: 'Showcase',
    tags: ['n8n', '자동화'],
    likes: 22,
    views: 294,
    comments: 2,
    createdAt: '1일 전',
  },
  {
    id: 104,
    projectId: 5,
    title: '대용량 파일에서 Nextcloud vs 온프레미스 S3 게이트웨이',
    summary: '업로드 속도, ACL 관리, 백업 운영 관점에서 실제 비교한 결과를 정리했습니다.',
    author: 'M. Han',
    department: 'IT 디지털',
    category: 'Comparison',
    tags: ['Nextcloud', '파일 공유'],
    likes: 18,
    views: 251,
    comments: 2,
    createdAt: '2일 전',
  },
  {
    id: 105,
    projectId: 10,
    title: 'GitLab 템플릿 업데이트 안내',
    summary: '캐시 의존성 및 재사용 가능한 보안 잡을 포함한 CI 템플릿을 배포했습니다.',
    author: 'S. Seo',
    department: 'IT 플랫폼',
    category: 'Announcement',
    tags: ['GitLab', 'DevOps', 'CI/CD'],
    likes: 16,
    views: 203,
    comments: 1,
    createdAt: '3일 전',
  },
]

export const initialDiscussionComments: Record<number, DiscussionComment[]> = {
  101: [
    {
      id: 1,
      author: 'S. Park',
      department: 'IT 디지털',
      message: '롤백 단계가 특히 유용합니다. 마이그레이션 일정 템플릿도 공유 가능할까요?',
      createdAt: '1시간 전',
      likes: 3,
    },
    {
      id: 2,
      author: 'Y. Kim',
      department: 'IT 지원',
      message: 'SSO는 마이그레이션 전후 중 언제 붙이셨나요? 저희도 순서를 고민 중입니다.',
      createdAt: '55분 전',
      likes: 2,
    },
    {
      id: 3,
      author: 'J. Kim',
      department: 'IT 디지털',
      message: '저희는 SSO를 먼저 적용하고, 부서 단위로 채널을 나눠 순차 이전했습니다.',
      createdAt: '40분 전',
      likes: 4,
    },
  ],
  102: [
    {
      id: 1,
      author: 'D. Cho',
      department: 'AX',
      message: '청크 크기를 줄이고 오버랩을 늘린 뒤 메타데이터 필터 재랭크를 같이 써보세요.',
      createdAt: '4시간 전',
      likes: 5,
    },
    {
      id: 2,
      author: 'H. Song',
      department: 'AX',
      message: '저희 FAQ 인덱스에서는 하이브리드 검색(BM25 + 벡터)이 정확도에 효과적이었습니다.',
      createdAt: '3시간 전',
      likes: 4,
    },
    {
      id: 3,
      author: 'H. Lee',
      department: 'AX',
      message: '감사합니다. 두 접근 모두 테스트하고 벤치마크 결과를 공유하겠습니다.',
      createdAt: '2시간 전',
      likes: 3,
    },
    {
      id: 4,
      author: 'P. Shin',
      department: 'IT 플랫폼',
      message: '재랭크를 넣으면 부하 시 응답 시간이 늘 수 있으니 지연 시간도 같이 보세요.',
      createdAt: '1시간 전',
      likes: 2,
    },
  ],
  103: [
    {
      id: 1,
      author: 'U. Ryu',
      department: 'IT 지원',
      message: '지원 리포팅에도 재사용하고 싶습니다. 익스포트된 워크플로 JSON 부탁드립니다.',
      createdAt: '20시간 전',
      likes: 2,
    },
    {
      id: 2,
      author: 'A. Choi',
      department: 'AX',
      message: '내일 환경 변수 플레이스홀더와 함께 올려두겠습니다.',
      createdAt: '18시간 전',
      likes: 3,
    },
  ],
  104: [
    {
      id: 1,
      author: 'K. Hyun',
      department: 'IT 플랫폼',
      message: '두 옵션에서 불변 백업 스냅샷은 어떤 방식으로 처리하셨나요?',
      createdAt: '1일 전',
      likes: 1,
    },
    {
      id: 2,
      author: 'M. Han',
      department: 'IT 디지털',
      message: 'S3 쪽은 오브젝트 락, Nextcloud는 스냅샷 검증 스케줄로 운영했습니다.',
      createdAt: '22시간 전',
      likes: 2,
    },
  ],
  105: [
    {
      id: 1,
      author: 'J. Choi',
      department: 'IT 플랫폼',
      message: '템플릿 업데이트 후 저희 레지스트리 파이프라인 빌드 시간이 약 30% 줄었습니다.',
      createdAt: '2일 전',
      likes: 3,
    },
  ],
}
