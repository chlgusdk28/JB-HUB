# JB-Hub

JB-Hub는 React/Vite 프런트엔드와 Express API를 함께 사용하는 풀스택 웹 프로젝트입니다. 프로젝트 허브, 관리자 콘솔, 가입 신청 플랫폼, 프로젝트 파일 업로드 흐름을 한 저장소에서 운영하도록 구성되어 있습니다.

기본 개발 흐름은 `web + API` 중심이며, 필요할 때는 SQLite API 또는 Mock API로도 빠르게 확인할 수 있습니다.

## 1. 핵심 기능

- 프로젝트 목록 조회, 상세 조회, 생성, 수정
- 프로젝트 파일 업로드, 텍스트 미리보기, 다운로드
- 관리자 인증, 사용자 관리, 감사 로그 조회
- 사이트 콘텐츠 관리
- 가입 신청 접수 및 관리자 승인/반려 처리
- 로컬 파일 업로드와 텍스트 미리보기

## 2. 기술 스택

### Frontend

- `React 18.3.1`
- `Vite 6.3.5`
- `TypeScript`
- `Tailwind CSS 4`
- `Radix UI`
- `MUI`
- `Lucide React`
- `Recharts`

### Backend

- `Node.js 22`
- `Express 5`
- `mysql2`
- `better-sqlite3`
- `jsonwebtoken`
- `bcrypt`
- `helmet`
- `cors`
- `express-fileupload`

### Local Runtime

- `MySQL 8.4`
- `SQLite`
- `.runtime/storage/*` 로컬 실행 산출물

## 3. 개발 환경 요구사항

- `Node.js 22.x`
- `npm 10.x` 이상
- Windows PowerShell 또는 bash

현재 프로젝트의 Node 버전 기준은 아래 파일을 따릅니다.

- `package.json`
- `.github/workflows/smoke.yml`

## 4. 저장소 구조

```text
JB-HUB/
├─ src/                  # 프런트엔드 소스
│  ├─ app/               # 화면/상태/비즈니스 로직
│  └─ styles/            # 전역 스타일
├─ server/               # API 서버, 런타임 경로, 샘플 시드 파일
├─ scripts/              # 실행/빌드/테스트용 진입 스크립트
├─ public/               # 정적 파일
├─ docs/                 # 구조 가이드 문서
├─ .runtime/             # 로컬 실행 중 생성되는 산출물
├─ .github/workflows/    # CI
└─ package.json          # 의존성과 npm 스크립트
```

런타임 산출물은 `.runtime/storage/` 아래로 모입니다.

```text
.runtime/
├─ dev-*.log            # 로컬 실행 로그
└─ storage/
   ├─ data/             # SQLite DB
   ├─ project-files/    # 업로드된 프로젝트 파일
   ├─ upload-temp/      # 임시 업로드 파일
   └─ backup/           # 로컬 백업 산출물
```

더 자세한 구조 설명은 `docs/PROJECT_STRUCTURE.md`, `src/app/README.md`, `scripts/README.md`를 보면 됩니다.

추적이 필요한 예시 프로젝트 파일은 `server/runtime-seeds/project-files/`에 두고, 실제 실행 중 생성되거나 업로드되는 파일만 `.runtime/storage/project-files/`로 분리했습니다.

## 5. 의존성 관리

### 설치 기준

- 설치 명령: `npm ci`
- 의존성 정의 파일: `package.json`
- 잠금 파일: `package-lock.json`
- 실제 설치 폴더: `node_modules/`

### 원칙

- `node_modules/`는 커밋하지 않습니다.
- 새 환경에서는 항상 `npm ci`로 다시 설치합니다.
- 버전 변경은 `package.json`과 `package-lock.json`을 함께 관리합니다.

### 주요 패키지

- 프런트엔드: `react`, `react-dom`, `vite`, `tailwindcss`, `@vitejs/plugin-react-swc`
- UI: `@radix-ui/*`, `@mui/material`, `@mui/icons-material`, `@emotion/*`, `lucide-react`, `motion`, `recharts`, `sonner`
- API 서버: `express`, `compression`, `cors`, `helmet`, `express-fileupload`, `dotenv`
- 인증/보안: `jsonwebtoken`, `bcrypt`
- DB: `mysql2`, `better-sqlite3`
- 기타: `date-fns`, `clsx`, `class-variance-authority`, `tailwind-merge`, `vaul`

## 6. 빠른 시작

### 6.1 환경 변수 파일 만들기

PowerShell:

```powershell
Copy-Item .env.example .env
```

그 다음 `.env`에서 아래 값은 반드시 실제 값으로 바꾸는 것을 권장합니다.

- `DB_PASSWORD`
- `API_JWT_HS256_SECRET`
- `ADMIN_DEFAULT_PASSWORD`

### 6.2 의존성 설치

```bash
npm ci
```

### 6.3 웹 + API 동시 실행

```bash
npm run dev
```

실행 후 기본 접속 주소:

- 웹: `http://127.0.0.1:3000`
- API 헬스체크: `http://127.0.0.1:8787/api/v1/health`

## 7. 실행 모드

### 7.1 기본 개발 모드: MySQL + Vite + Express

로컬 MySQL이 이미 준비돼 있을 때 사용하는 방식입니다.

```bash
npm run dev
```

동작 방식:

- `npm run dev`는 `scripts/dev-stack.mjs`를 실행합니다.
- 웹은 `scripts/run-vite.mjs`를 통해 실행됩니다.
- API는 `scripts/run-api.mjs --watch`를 통해 실행됩니다.

### 7.2 웹만 실행

```bash
npm run dev:web
```

프런트엔드만 따로 확인하고 싶을 때 사용합니다.

### 7.3 API만 실행

```bash
npm run dev:api
```

MySQL이 이미 켜져 있고 API만 따로 보고 싶을 때 사용합니다.

### 7.4 SQLite API 모드

Docker 없이 로컬 확인이 필요할 때 사용할 수 있습니다.

터미널 1:

```bash
npm run dev:web
```

터미널 2:

```bash
npm run dev:sqlite
```

특징:

- SQLite DB 파일은 `.runtime/storage/data/jbhub.db`에 생성됩니다.
- 업로드 관련 파일은 `.runtime/storage/project-files/`, `.runtime/storage/upload-temp/` 아래에 생성됩니다.
- 빠른 로컬 검증에 적합하지만 기본 운영 기준은 아닙니다.

### 7.5 Mock API 모드

실제 DB 연결 없이 화면 연동만 볼 때 사용합니다.

터미널 1:

```bash
npm run dev:web
```

터미널 2:

```bash
npm run dev:mock
```

## 8. Windows UNC 경로 주의사항

프로젝트를 `\\wsl.localhost\...` 같은 Windows UNC 경로에서 열면 파일 감시가 불안정할 수 있습니다.

이 저장소는 이를 고려해 래퍼 스크립트를 사용합니다.

- `scripts/run-vite.mjs`
- `scripts/run-api.mjs`
- `scripts/dev-stack.mjs`

동작 요약:

- UNC 경로에서는 웹 서버가 자동으로 preview 모드로 우회될 수 있습니다.
- watch 모드가 불안정할 경우 polling 기반 옵션이 사용됩니다.
- 직접 `vite`를 실행하는 것보다 `npm run dev` 또는 `node scripts/run-vite.mjs` 사용을 권장합니다.

## 9. 제품 모드

서버는 `APP_PRODUCT_MODE` 값에 따라 동작 성격이 달라질 수 있습니다.

- 기본값: `signup`
- `hub`: 프로젝트 허브 중심 모드
- `signup`: 가입 신청 플랫폼 중심 모드

코드 기준으로 `APP_PRODUCT_MODE !== 'hub'`이면 signup 플랫폼 흐름이 활성화됩니다.

## 10. 주요 npm 스크립트

| 스크립트 | 설명 |
| --- | --- |
| `npm run dev` | 웹 + API 동시 실행 |
| `npm run dev:web` | Vite 개발 서버 실행 |
| `npm run dev:api` | MySQL 기반 API 실행 |
| `npm run dev:sqlite` | SQLite 기반 API 실행 |
| `npm run dev:mock` | Mock API 실행 |
| `npm run build` | 프런트엔드 빌드 |
| `npm run preview` | 빌드 결과 프리뷰 |
| `npm run auth:mint-token` | 개발용 JWT 발급 |
| `npm run test:api` | API 테스트 실행 |
| `npm run smoke:web` | 웹 smoke 테스트 |
| `npm run smoke` | API 테스트 + 빌드 + 웹 smoke 테스트 |
| `npm run platform:reset` | 가입 플랫폼/프로젝트 관련 데이터 초기화 |

## 11. 환경 변수 설명

### 11.1 기본 개발용 `.env`

주요 항목:

- `API_PORT`: API 포트, 기본값 `8787`
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`: MySQL 연결 정보
- `DB_CONN_LIMIT`: 커넥션 풀 크기
- `DB_SEED`: 허브 모드 데이터 시드 여부
- `DB_CONNECT_RETRY_ATTEMPTS`, `DB_CONNECT_RETRY_DELAY_MS`: DB 재시도 설정
- `API_RATE_LIMIT_WINDOW_MS`, `API_RATE_LIMIT_MAX_REQUESTS`: API rate limit
- `CORS_ALLOWED_ORIGINS`: 허용 origin 목록
- `API_JWT_HS256_SECRET`, `API_JWT_ISSUER`, `API_JWT_AUDIENCE`: JWT 설정
- `JWT_ACCESS_TOKEN_EXPIRATION`, `JWT_REFRESH_TOKEN_EXPIRATION`: 토큰 TTL
- `ADMIN_DEFAULT_USERNAME`, `ADMIN_DEFAULT_PASSWORD`, `ADMIN_DEFAULT_EMAIL`: 기본 관리자 계정
- `ADMIN_SESSION_TIMEOUT_MS`, `ADMIN_MAX_LOGIN_ATTEMPTS`, `ADMIN_LOCKOUT_DURATION_MS`: 관리자 보안 설정
- `AUTH_STATE_CLEANUP_INTERVAL_MS`: 인증 상태 정리 주기
- `AUDIT_LOG_ENABLED`, `AUDIT_LOG_RETENTION_DAYS`: 감사 로그 설정
- `VITE_API_BASE_URL`: 정적 빌드가 절대 API URL을 필요로 할 때만 사용

### 11.2 프로덕션용 `.env.production`

`.env.production.example`을 참고해 별도 파일을 관리하세요.

프로덕션에서 특히 중요한 항목:

- `NODE_ENV=production`
- 강력한 `DB_PASSWORD`
- 강력한 `API_JWT_HS256_SECRET`
- HTTPS 기반 `CORS_ALLOWED_ORIGINS`
- `ADMIN_DEFAULT_PASSWORD` 변경
- 필요 시 `VITE_API_BASE_URL`

## 12. API 개요

기본 API prefix:

- 공개 API: `/api/v1`
- 관리자 API: `/api/admin`

### 12.1 공개 API 예시

- `GET /api/v1/health`
- `GET /api/v1/projects`
- `GET /api/v1/projects/insights`
- `GET /api/v1/projects/:id`
- `POST /api/v1/projects`
- `GET /api/v1/projects/:id/files`
- `POST /api/v1/projects/:id/files`
- `GET /api/v1/projects/:id/files/content`
- `GET /api/v1/projects/:id/files/download`
- `GET /api/v1/site-content`
- `GET /api/v1/signup-platform`
- `POST /api/v1/signup-applications`
- `GET /api/v1/docs`

### 12.2 관리자 API 예시

- `POST /api/admin/login`
- `POST /api/admin/refresh`
- `POST /api/admin/logout`
- `GET /api/admin/me`
- `GET /api/admin/projects`
- `POST /api/admin/projects`
- `PUT /api/admin/projects/:id`
- `DELETE /api/admin/projects/:id`
- `GET /api/admin/users`
- `POST /api/admin/users`
- `PATCH /api/admin/users/:id`
- `DELETE /api/admin/users/:id`
- `GET /api/admin/audit-logs`
- `GET /api/admin/stats`
- `GET /api/admin/backups`
- `POST /api/admin/backups/create`
- `POST /api/admin/backups/:id/restore`
- `DELETE /api/admin/backups/:id`
- `GET /api/admin/signup-applications`
- `PATCH /api/admin/signup-applications/:id`
- `DELETE /api/admin/signup-applications/:id`
- `GET /api/admin/services/overview`
- `POST /api/admin/services/deployments/:deploymentId/:action`

### 12.3 프로젝트 조회 쿼리 예시

`GET /api/v1/projects`에서 자주 쓰는 쿼리:

- `search`
- `department`
- `minStars`
- `sortBy=newest|stars|views|comments`
- `limit`
- `offset`

## 13. 관리자 인증 개요

관리자 API는 JWT + 관리자 세션 검증 흐름을 사용합니다.

관련 엔드포인트:

- `POST /api/admin/login`
- `POST /api/admin/refresh`
- `POST /api/admin/logout`
- `GET /api/admin/me`

보안상 권장 사항:

- 기본 관리자 비밀번호를 반드시 변경하세요.
- `API_JWT_HS256_SECRET`는 32자 이상 강한 값으로 설정하세요.
- 프로덕션에서는 `CORS_ALLOWED_ORIGINS`를 구체적인 HTTPS 도메인으로 제한하세요.

## 14. 구조 가이드

디렉터리를 빠르게 파악하려면 아래 순서로 보는 편이 좋습니다.

- `docs/PROJECT_STRUCTURE.md`
- `src/app/README.md`
- `src/app/components/README.md`
- `server/README.md`
- `scripts/README.md`

## 15. 테스트와 CI

로컬에서 최소 확인 권장 순서:

```bash
npm run test:api
npm run build
npm run smoke:web
```

한 번에 실행:

```bash
npm run smoke
```

GitHub Actions에서는 `.github/workflows/smoke.yml` 기준으로 다음 순서를 실행합니다.

1. Node 22 설정
2. MySQL 컨테이너 실행
3. `npm ci`
4. `npm run smoke`

## 16. 데이터 초기화

가입 플랫폼/프로젝트 관련 데이터와 로컬 산출물을 정리할 때:

```bash
npm run platform:reset
```

이 스크립트는 아래 항목들을 비울 수 있습니다.

- 프로젝트 레코드
- 가입 신청 데이터
- 감사 로그
- 관리자 사용자 데이터
- `.runtime/storage/project-files/`
- `.runtime/storage/backup/`

실행 전 데이터 손실 여부를 꼭 확인하세요.

## 17. Git 업로드 전 체크리스트

커밋해도 되는 것:

- 소스 코드
- 설정 파일
- `package.json`
- `package-lock.json`
- 문서 파일

커밋하지 말아야 하는 것:

- `node_modules/`
- `dist/`
- `.env`
- 실제 비밀번호/토큰 값
- `.runtime/`
- `artifacts/`
- `final/`, `final2/`
- 로그 파일

새 환경에서는 아래 순서로 다시 준비하면 됩니다.

```bash
npm ci
Copy-Item .env.example .env
npm run dev
```

## 18. 트러블슈팅

### `npm ci`가 실패할 때

- Node 버전이 `22.x`인지 확인하세요.
- 기존 `node_modules/`와 lockfile 충돌이 있었으면 정리 후 다시 시도하세요.

### API가 DB에 연결되지 않을 때

- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` 값을 점검하세요.
- SQLite 모드가 목적이면 `npm run dev:sqlite`로 우회 실행할 수 있습니다.

### 웹에서 API 호출이 안 될 때

- `http://127.0.0.1:8787/api/v1/health` 응답을 먼저 확인하세요.
- 로컬 개발에서는 `VITE_API_BASE_URL`을 비워두는 편이 안전합니다.
- `CORS_ALLOWED_ORIGINS` 설정을 확인하세요.

## 19. 참고 파일

- `package.json`
- `.env.example`
- `.env.production.example`
- `docs/PROJECT_STRUCTURE.md`
- `src/app/README.md`
- `src/app/components/README.md`
- `server/README.md`
- `scripts/README.md`
- `server/index.js`
- `server/runtime-paths.js`
- `server/signup-platform.js`
- `scripts/dev-stack.mjs`
