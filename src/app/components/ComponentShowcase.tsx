import { useState } from 'react'
import { Search, Home, Compass, FolderGit2, Plus, Star } from 'lucide-react'
import {
  OpalButton,
  OpalInput,
  OpalTag,
  OpalCard,
  OpalProjectCard,
  OpalNavBar,
  OpalSidebarMenu,
} from './opal'
import { useToast } from './ToastProvider'

export function ComponentShowcase() {
  const [inputValue, setInputValue] = useState('')
  const [activeMenuItem, setActiveMenuItem] = useState('home')
  const { info } = useToast()

  const menuSections = [
    {
      title: '메인',
      items: [
        { id: 'home', label: '홈', icon: <Home className="h-4 w-4" strokeWidth={1.5} /> },
        { id: 'explore', label: '탐색', icon: <Compass className="h-4 w-4" strokeWidth={1.5} /> },
        { id: 'projects', label: '프로젝트', icon: <FolderGit2 className="h-4 w-4" strokeWidth={1.5} />, badge: 12 },
      ],
    },
  ]

  return (
    <div className="min-h-screen bg-[#FAFBFC]">
      <OpalNavBar
        logo={<div className="h-8 w-8 rounded-xl bg-gray-900" />}
        logoText="오팔 디자인 시스템"
        searchSlot={
          <OpalInput
            value={inputValue}
            onChange={setInputValue}
            placeholder="검색"
            variant="filled"
            icon={<Search className="h-4 w-4" />}
          />
        }
        rightItems={
          <>
            <OpalButton variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />}>
              새 프로젝트
            </OpalButton>
            <div className="h-8 w-8 rounded-full bg-gray-200" />
          </>
        }
      />

      <div className="flex">
        <OpalSidebarMenu sections={menuSections} activeItemId={activeMenuItem} onItemClick={setActiveMenuItem} />

        <main className="ml-56 mt-20 flex-1 p-16">
          <div className="max-w-5xl space-y-20">
            <section className="space-y-8">
              <div>
                <h2 className="mb-3 text-3xl font-medium text-gray-900">버튼</h2>
                <p className="text-sm text-gray-500">기본 동작에 맞춘 버튼 스타일 예시입니다.</p>
              </div>
              <div className="flex flex-wrap gap-4">
                <OpalButton variant="primary" size="lg">기본형 대형</OpalButton>
                <OpalButton variant="secondary" size="md">보조형 중간</OpalButton>
                <OpalButton variant="ghost" size="sm">고스트 소형</OpalButton>
                <OpalButton variant="primary" size="md" icon={<Star className="h-4 w-4" />}>
                  아이콘 포함
                </OpalButton>
              </div>
            </section>

            <section className="space-y-8">
              <div>
                <h2 className="mb-3 text-3xl font-medium text-gray-900">입력 필드</h2>
                <p className="text-sm text-gray-500">폼에 바로 사용할 수 있는 입력 스타일 예시입니다.</p>
              </div>
              <div className="space-y-6">
                <div>
                  <div className="mb-3 text-xs text-gray-400">채움형</div>
                  <OpalInput value="" onChange={() => {}} placeholder="채움 배경" variant="filled" />
                </div>
                <div>
                  <div className="mb-3 text-xs text-gray-400">밑줄형</div>
                  <OpalInput value="" onChange={() => {}} placeholder="밑줄만 표시" variant="underlined" />
                </div>
                <div>
                  <div className="mb-3 text-xs text-gray-400">아이콘 포함</div>
                  <OpalInput value="" onChange={() => {}} placeholder="검색 아이콘 포함" variant="filled" icon={<Search className="h-4 w-4" />} />
                </div>
              </div>
            </section>

            <section className="space-y-8">
              <div>
                <h2 className="mb-3 text-3xl font-medium text-gray-900">태그</h2>
                <p className="text-sm text-gray-500">기술 스택이나 분류용으로 쓰는 태그 예시입니다.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <OpalTag size="sm" variant="default">Python</OpalTag>
                <OpalTag size="sm" variant="default">JavaScript</OpalTag>
                <OpalTag size="sm" variant="default">TypeScript</OpalTag>
                <OpalTag size="md" variant="subtle">React</OpalTag>
                <OpalTag size="md" variant="subtle">Node.js</OpalTag>
              </div>
            </section>

            <section className="space-y-8">
              <div>
                <h2 className="mb-3 text-3xl font-medium text-gray-900">카드</h2>
                <p className="text-sm text-gray-500">간격과 그림자 단계별 카드 예시입니다.</p>
              </div>
              <div className="grid grid-cols-3 gap-6">
                <OpalCard padding="compact" elevation="none">
                  <div className="text-sm text-gray-600">촘촘한 간격 / 그림자 없음</div>
                </OpalCard>
                <OpalCard padding="comfortable" elevation="minimal">
                  <div className="text-sm text-gray-600">보통 간격 / 최소 그림자</div>
                </OpalCard>
                <OpalCard padding="spacious" elevation="low">
                  <div className="text-sm text-gray-600">여유 간격 / 약한 그림자</div>
                </OpalCard>
              </div>
            </section>

            <section className="space-y-8">
              <div>
                <h2 className="mb-3 text-3xl font-medium text-gray-900">프로젝트 카드</h2>
                <p className="text-sm text-gray-500">실제 목록에 가까운 카드 예시입니다.</p>
              </div>
              <div className="space-y-6">
                <OpalProjectCard
                  title="AI 챗봇 자동 응답 시스템"
                  description="고객 문의를 자동으로 처리하는 AI 기반 챗봇 시스템입니다."
                  author="김지원"
                  stars={42}
                  forks={12}
                  comments={8}
                  tags={['Python', 'AI', 'GPT-4']}
                  onClick={() => info('프로젝트 상세 페이지로 이동합니다.')}
                />
                <OpalProjectCard
                  title="React 사용자 포털"
                  description="사내 여러 서비스를 위한 통합 사용자 포털입니다."
                  author="박서연"
                  stars={28}
                  tags={['React', 'TypeScript', 'Tailwind']}
                  onClick={() => info('프로젝트 상세 페이지로 이동합니다.')}
                />
              </div>
            </section>

            <section className="space-y-8 pb-32">
              <div>
                <h2 className="mb-3 text-3xl font-medium text-gray-900">디자인 원칙</h2>
                <p className="text-sm text-gray-500">오팔 디자인 시스템의 핵심 원칙입니다.</p>
              </div>
              <OpalCard padding="spacious" elevation="minimal">
                <div className="space-y-6 text-sm leading-relaxed text-gray-600">
                  <div>
                    <div className="mb-2 font-medium text-gray-900">1. 테두리 최소화</div>
                    <div>기본적으로 굵은 테두리를 쓰지 않고, 여백과 배경 차이로 영역을 구분합니다.</div>
                  </div>
                  <div>
                    <div className="mb-2 font-medium text-gray-900">2. 대비 절제</div>
                    <div>배경 대비를 과하게 주지 않고, 차분한 회색 계열로 밀도를 맞춥니다.</div>
                  </div>
                  <div>
                    <div className="mb-2 font-medium text-gray-900">3. 낮은 그림자</div>
                    <div>그림자는 눈에 거슬리지 않을 정도로만 사용해 계층만 전달합니다.</div>
                  </div>
                  <div>
                    <div className="mb-2 font-medium text-gray-900">4. 크기와 여백 중심 강조</div>
                    <div>강조는 색보다 크기와 간격으로 먼저 전달합니다.</div>
                  </div>
                  <div>
                    <div className="mb-2 font-medium text-gray-900">5. 조용한 UI</div>
                    <div>컴포넌트가 앞에 나서지 않고, 사용자가 콘텐츠에 집중하도록 설계합니다.</div>
                  </div>
                </div>
              </OpalCard>
            </section>
          </div>
        </main>
      </div>
    </div>
  )
}
