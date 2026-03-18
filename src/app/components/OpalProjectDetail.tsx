import { Star, GitFork } from 'lucide-react'
import { useState } from 'react'
import { OpalCard } from './OpalCard'

interface OpalProjectDetailProps {
  projectId: number
}

export function OpalProjectDetail({ projectId }: OpalProjectDetailProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'discussion'>('overview')
  const [isStarred, setIsStarred] = useState(false)

  const project = {
    title: 'AI 챗봇 자동 응답 시스템',
    description: '고객 문의를 자동으로 처리하는 AI 기반 챗봇 시스템입니다. GPT-4를 활용한 자연어 처리와 사내 FAQ 학습 기능을 포함합니다.',
    author: '김지원',
    department: 'IT기획팀',
    tags: ['Python', 'AI/ML', 'ChatGPT', 'FastAPI'],
    stars: 127,
    forks: 34,
  }

  return (
    <div className="space-y-12">
      <section className="mx-auto max-w-4xl space-y-8 text-center">
        <div className="space-y-4">
          <h1 className="text-5xl font-semibold text-gray-900">{project.title}</h1>
          <p className="text-xl leading-relaxed text-gray-600">{project.description}</p>
        </div>

        <div className="flex items-center justify-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-400">
            <span className="text-base font-medium text-white">{project.author[0]}</span>
          </div>
          <div className="text-left">
            <div className="text-[15px] font-medium text-gray-900">{project.author}</div>
            <div className="text-[13px] text-gray-500">{project.department}</div>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          {project.tags.map((tag) => (
            <span key={tag} className="rounded-lg bg-gray-100 px-4 py-2 text-[13px] font-medium text-gray-600">
              {tag}
            </span>
          ))}
        </div>

        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => setIsStarred(!isStarred)}
            className={`flex items-center gap-2 rounded-xl px-8 py-4 font-medium transition-all ${
              isStarred ? 'bg-yellow-50 text-yellow-700' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Star className={`h-5 w-5 ${isStarred ? 'fill-yellow-500' : ''}`} />
            <span className="text-[15px]">별표</span>
            <span className="text-[15px]">{project.stars}</span>
          </button>

          <button className="flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-4 font-medium text-white transition-all hover:bg-blue-700">
            <GitFork className="h-5 w-5" />
            <span className="text-[15px]">포크</span>
            <span className="text-[15px]">{project.forks}</span>
          </button>
        </div>
      </section>

      <section className="flex justify-center gap-3">
        {[
          { id: 'overview' as const, label: '개요' },
          { id: 'discussion' as const, label: '토론' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-xl px-8 py-3 text-[15px] font-medium transition-all ${
              activeTab === tab.id ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </section>

      <section>
        {activeTab === 'overview' ? (
          <div className="space-y-8">
            <OpalCard padding="large">
              <h2 className="mb-6 text-3xl font-semibold text-gray-900">프로젝트 소개</h2>
              <div className="prose max-w-none">
                <p className="mb-8 text-[15px] leading-relaxed text-gray-600">
                  이 프로젝트는 고객 문의를 자동으로 처리하는 AI 기반 챗봇 시스템입니다. GPT-4 API를 사용해 자연어 처리를 수행하고,
                  사내 FAQ 데이터를 학습해 더 정확한 응답을 제공합니다.
                </p>
              </div>
            </OpalCard>

            <OpalCard padding="large">
              <h3 className="mb-6 text-2xl font-semibold text-gray-900">주요 기능</h3>
              <div className="space-y-4">
                {[
                  '실시간 고객 문의 자동 응답',
                  '사내 FAQ 데이터베이스 연동',
                  '대화 이력 저장 및 분석',
                  '다국어 지원(한국어, 영어)',
                ].map((feature, index) => (
                  <div key={feature} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-100">
                      <span className="text-xs font-semibold text-blue-600">{index + 1}</span>
                    </div>
                    <p className="text-[15px] text-gray-700">{feature}</p>
                  </div>
                ))}
              </div>
            </OpalCard>

            <OpalCard padding="large">
              <h3 className="mb-6 text-2xl font-semibold text-gray-900">실행 방법</h3>
              <div className="rounded-xl bg-gray-900 p-6">
                <code className="font-mono text-[15px] text-green-400">
                  $ pip install -r requirements.txt
                  <br />
                  $ python main.py
                </code>
              </div>
            </OpalCard>
          </div>
        ) : null}

        {activeTab === 'discussion' ? (
          <div className="space-y-6">
            <OpalCard padding="large">
              <textarea
                placeholder="댓글을 입력해 주세요."
                className="w-full resize-none rounded-xl bg-gray-50 p-4 text-[15px] placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                rows={4}
              />
              <div className="mt-4 flex justify-end">
                <button className="rounded-xl bg-blue-600 px-6 py-3 text-[15px] font-medium text-white transition-all hover:bg-blue-700">
                  댓글 작성
                </button>
              </div>
            </OpalCard>

            {[
              {
                author: '이민준',
                content: '정말 유용한 프로젝트네요. 우리 부서에서도 활용해 보고 싶습니다.',
                time: '3시간 전',
              },
              {
                author: '박서연',
                content: 'API 연동 부분에 대한 문서를 조금 더 추가해 주시면 좋겠습니다.',
                time: '1일 전',
              },
            ].map((comment) => (
              <OpalCard key={`${comment.author}-${comment.time}`} padding="large">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-400 to-pink-400">
                    <span className="text-[13px] font-medium text-white">{comment.author[0]}</span>
                  </div>
                  <div className="flex-1">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-[15px] font-medium text-gray-900">{comment.author}</span>
                      <span className="text-[13px] text-gray-500">· {comment.time}</span>
                    </div>
                    <p className="text-[15px] leading-relaxed text-gray-700">{comment.content}</p>
                  </div>
                </div>
              </OpalCard>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  )
}
