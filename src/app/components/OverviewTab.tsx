import { CheckCircle2, Info, Zap } from 'lucide-react';

export function OverviewTab() {
  return (
    <div className="space-y-8">
      {/* Quick Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-blue-900 mb-1">프로젝트 소개</h3>
          <p className="text-sm text-blue-800">
            이 프로젝트는 고객 문의를 자동으로 처리하는 AI 기반 챗봇 시스템입니다. 
            GPT-4 API를 활용하여 자연어 처리를 수행하며, 사내 FAQ 데이터를 학습하여 정확한 응답을 제공합니다.
          </p>
        </div>
      </div>

      {/* Main Features */}
      <section>
        <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-blue-600" />
          주요 기능
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            {
              title: '실시간 자동 응답',
              description: '24/7 고객 문의를 자동으로 처리하고 즉각적인 답변 제공',
            },
            {
              title: 'FAQ 데이터베이스 연동',
              description: '사내 FAQ 시스템과 연동하여 정확도 높은 응답 생성',
            },
            {
              title: '대화 히스토리 관리',
              description: '모든 대화 내역을 저장하고 분석하여 서비스 개선',
            },
            {
              title: '다국어 지원',
              description: '한국어와 영어를 지원하여 글로벌 고객 대응',
            },
            {
              title: '관리자 대시보드',
              description: '실시간 모니터링 및 성능 분석 대시보드 제공',
            },
            {
              title: '커스텀 학습',
              description: '부서별 특화 데이터로 추가 학습 가능',
            },
          ].map((feature, index) => (
            <div key={index} className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-sm transition-all">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">{feature.title}</h3>
                  <p className="text-sm text-gray-600">{feature.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Installation & Setup */}
      <section>
        <h2 className="text-xl font-bold text-gray-900 mb-4">설치 및 설정</h2>
        
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">1. 환경 요구사항</h3>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                  Python 3.9 이상
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                  OpenAI API 키
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                  PostgreSQL 12 이상 (선택사항)
                </li>
              </ul>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">2. 패키지 설치</h3>
            <div className="bg-gray-900 rounded-lg p-4">
              <code className="text-sm text-green-400 font-mono">
                $ pip install -r requirements.txt
              </code>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">3. 환경 변수 설정</h3>
            <div className="bg-gray-900 rounded-lg p-4">
              <code className="text-sm text-gray-300 font-mono block">
                <span className="text-blue-400">OPENAI_API_KEY</span>=your_api_key_here<br />
                <span className="text-blue-400">DATABASE_URL</span>=postgresql://user:pass@localhost/dbname<br />
                <span className="text-blue-400">PORT</span>=8000
              </code>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">4. 실행</h3>
            <div className="bg-gray-900 rounded-lg p-4">
              <code className="text-sm text-green-400 font-mono">
                $ python main.py
              </code>
            </div>
          </div>
        </div>
      </section>

      {/* Usage Guide */}
      <section>
        <h2 className="text-xl font-bold text-gray-900 mb-4">사용 가이드</h2>
        <div className="prose max-w-none">
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h3 className="text-base font-semibold text-gray-900 mb-3">기본 사용법</h3>
            <p className="text-sm text-gray-700 mb-4">
              서버가 실행되면 <code className="px-2 py-0.5 bg-gray-100 rounded text-xs">http://localhost:8000</code>에서 
              웹 인터페이스에 접근할 수 있습니다.
            </p>
            
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
                <div>
                  <p className="text-sm font-medium text-gray-900">채팅 인터페이스 접속</p>
                  <p className="text-sm text-gray-600">웹 브라우저에서 챗봇 UI에 접속합니다.</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
                <div>
                  <p className="text-sm font-medium text-gray-900">질문 입력</p>
                  <p className="text-sm text-gray-600">고객 문의 내용을 자연어로 입력합니다.</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
                <div>
                  <p className="text-sm font-medium text-gray-900">자동 응답 확인</p>
                  <p className="text-sm text-gray-600">AI가 생성한 답변을 확인하고 필요시 수정합니다.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contributors */}
      <section>
        <h2 className="text-xl font-bold text-gray-900 mb-4">기여자</h2>
        <div className="flex items-center gap-3">
          {['김지현', '이민준', '박서연'].map((name, index) => (
            <div key={index} className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-medium">{name[0]}</span>
              </div>
              <span className="text-sm font-medium text-gray-900">{name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Contact */}
      <section className="bg-gray-50 border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-3">문의 및 지원</h2>
        <p className="text-sm text-gray-600 mb-3">
          프로젝트 사용 중 문제가 발생하거나 개선 사항이 있다면 언제든지 연락주세요.
        </p>
        <div className="flex gap-3">
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all text-sm font-medium">
            이슈 등록하기
          </button>
          <button className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-all text-sm font-medium">
            Slack으로 연락하기
          </button>
        </div>
      </section>
    </div>
  );
}
