# JB-Hub

JB-Hub는 React/Vite 프런트엔드와 Express API를 함께 사용하는 풀스택 웹 프로젝트입니다. 프로젝트 허브 성격의 서비스, 관리자 콘솔, 가입 신청 플랫폼, 프로젝트 파일 업로드, Docker 이미지 업로드/배포 보조 기능까지 한 저장소에서 운영하도록 구성되어 있습니다.

기본 개발 흐름은 MySQL + Docker 기준이며, 필요할 때는 SQLite API 또는 Mock API로도 빠르게 확인할 수 있습니다.

## 1. 핵심 기능

- 프로젝트 목록 조회, 상세 조회, 생성, 수정
- 프로젝트 파일 업로드, 텍스트 미리보기, 다운로드
- 관리자 인증, 사용자 관리, 감사 로그 조회
- 사이트 콘텐츠 관리
- 가입 신청 접수 및 관리자 승인/반려 처리
- Docker 이미지 업로드, 소스 기반 빌드, 배포 로그 확인
- 오프라인 반입용 air-gap 번들 및 최종 패키지 생성

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

### Infra / Runtime

- `Docker`
- `Docker Compose v2`
- `MySQL 8.4`
- `Adminer 4`
- `Nginx` (웹 컨테이너 reverse proxy)

## 3. 개발 환경 요구사항

- `Node.js 22.x`
- `npm 10.x` 이상
- `Docker Desktop`
- `Docker Compose v2`
- Windows PowerShell 또는 bash

현재 프로젝트의 Node 버전 기준은 아래 파일을 따릅니다.

- `Dockerfile.web`
- `Dockerfile.api`
- `.github/workflows/smoke.yml`

## 4. 저장소 구조

```text
JB-HUB/
├─ src/                  # React 프런트엔드
├─ server/               # Express API, MySQL/SQLite 서버 코드
├─ scripts/              # 개발/빌드/테스트/번들 자동화 스크립트
├─ public/               # 정적 파일
├─ docker/               # Nginx 등 Docker 관련 설정
├─ .github/workflows/    # CI
├─ package.json          # 의존성 및 npm 스크립트
├─ docker-compose.yml    # 로컬 MySQL/Adminer 개발용
└─ docker-compose.airgap.yml
                       # 오프라인 반입/배포용 스택
```

런타임 중 아래 경로가 자동 생성될 수 있습니다.

- `project-files/`
- `docker-uploads/`
- `docker-temp/`
- `upload-temp/`
- `data/`
- `artifacts/`
- `backup/`
- `final/`, `final2/`
- `.runtime/`

위 경로들은 로컬 산출물이므로 Git 커밋 대상이 아닙니다.

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

### 6.3 MySQL 실행

```bash
npm run docker:up
```

### 6.4 웹 + API 동시 실행

```bash
npm run dev
```

실행 후 기본 접속 주소:

- 웹: `http://127.0.0.1:3000`
- API 헬스체크: `http://127.0.0.1:8787/api/v1/health`
- Adminer: `http://127.0.0.1:8081`

## 7. 실행 모드

### 7.1 기본 개발 모드: MySQL + Vite + Express

가장 권장되는 로컬 개발 방식입니다.

```bash
npm run docker:up
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

- SQLite DB 파일은 `data/jbhub.db`에 생성됩니다.
- `project-files/`, `docker-uploads/`, `docker-temp/`도 필요 시 생성됩니다.
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
| `npm run smoke:docker` | Docker 업로드 smoke 테스트 |
| `npm run smoke` | API 테스트 + 빌드 + 웹 smoke 테스트 |
| `npm run platform:reset` | 가입 플랫폼/프로젝트 관련 데이터 초기화 |
| `npm run docker:up` | 로컬 MySQL/Adminer 실행 |
| `npm run docker:down` | 로컬 MySQL/Adminer 종료 |
| `npm run docker:logs` | MySQL 로그 확인 |
| `npm run docker:reset` | 로컬 DB 볼륨 초기화 |
| `npm run docker:local -- <version>` | 버전 태그를 지정해 로컬 전체 앱 스택 빌드/실행 |
| `npm run docker:local:down` | 로컬 전체 앱 스택 종료 |
| `npm run docker:local:logs` | 로컬 전체 앱 스택 로그 확인 |
| `npm run docker:local:ps` | 로컬 전체 앱 스택 상태 확인 |
| `npm run docker:bundle` | 업로드용 프런트/백엔드 Docker 번들 생성 |
| `npm run docker:bundle:airgap` | JB-Hub 전체 스택 air-gap 번들 생성 |
| `npm run docker:bundle:airgap:tar` | air-gap 번들을 tar 형식으로 생성 |
| `npm run docker:bundle:final` | DB 덤프 포함 최종 반입 패키지 생성 |
| `npm run docker:bundle:final:tar` | 최종 반입 패키지를 tar 형식으로 생성 |

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

### 11.3 air-gap용 `.env.airgap.example`

air-gap compose에서 사용하는 항목:

- `JBHUB_STACK_NAME`
- `JBHUB_WEB_IMAGE`
- `JBHUB_API_IMAGE`
- `JBHUB_MYSQL_IMAGE`
- `JBHUB_ADMINER_IMAGE`
- `JBHUB_WEB_PORT`
- `JBHUB_API_PORT`
- `JBHUB_DB_PORT`
- `JBHUB_ADMINER_PORT`
- `MYSQL_ROOT_PASSWORD`
- `MYSQL_DATABASE`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `APP_PRODUCT_MODE`
- `CORS_ALLOWED_ORIGINS`

웹 컨테이너가 same-origin `/api` 프록시를 사용하는 경우 `CORS_ALLOWED_ORIGINS`는 비워둘 수 있습니다.

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

## 14. Docker 기반 로컬 개발

### 14.1 로컬 DB 스택 실행

```bash
npm run docker:up
```

실행되는 컨테이너:

- `mysql:8.4`
- `adminer:4`

포트:

- MySQL: `3310`
- Adminer: `8081`

### 14.2 종료 및 초기화

```bash
npm run docker:down
npm run docker:reset
```

`docker:reset`은 volume까지 함께 정리합니다.

### 14.3 로컬 전체 앱 스택 실행

파일을 여러 개 추가하지 않고, 기존 `Dockerfile.web`, `Dockerfile.api`, `docker-compose.airgap.yml`만 재사용하는 단순한 방식입니다.

```bash
npm run docker:local -- 1.0.0
```

이 명령은 아래를 한 번에 처리합니다.

- `jbhub-web:1.0.0` 이미지 빌드
- `jbhub-api:1.0.0` 이미지 빌드
- 로컬 compose 스택 실행

기본 포트:

- Web: `8080`
- API: `8788`
- MySQL: `3311`

Adminer까지 함께 띄우려면:

```bash
npm run docker:local -- 1.0.0 --ops
```

JB-Hub 내부 Docker 기능까지 같이 테스트하려면:

```bash
npm run docker:local -- 1.0.0 --docker
```

추가 포트:

- Adminer: `8082`

정리 명령:

```bash
npm run docker:local:down
npm run docker:local:down -- --volumes
```

참고:

- 기존 `docker-compose.yml`은 개발용 DB 전용입니다.
- 로컬 실행용 env는 `.runtime/docker-local-stack.env`로 자동 생성됩니다.
- `docker:local`은 버전 문자열만 입력하면 되도록 단순화한 진입점입니다.

## 15. Docker 번들 기능

### 15.1 외부 서비스 업로드용 Docker 번들

JB-Hub 안에서 다른 프로젝트의 프런트/백엔드 이미지를 한 번에 빌드해서 tar.gz 번들로 만들 수 있습니다.

예시:

```bash
npm run docker:bundle -- --name demo --frontend-context ./frontend --backend-context ./backend
```

추가 예시:

```bash
npm run docker:bundle -- --name smartseat --context C:\path\to\repo --frontend-dockerfile Dockerfile.frontend --backend-dockerfile Dockerfile.backend
```

주요 옵션:

- `--name`
- `--context`
- `--frontend-context`
- `--backend-context`
- `--frontend-dockerfile`
- `--backend-dockerfile`
- `--build-arg`
- `--frontend-build-arg`
- `--backend-build-arg`
- `--platform`
- `--dry-run`

## 16. Air-gap 배포

### 16.1 전체 스택 air-gap 번들 생성

```bash
npm run docker:bundle:airgap
```

기본 출력:

- `artifacts/jbhub-airgap-stack-YYYYMMDD/`

기본 포함 이미지:

- `jbhub-web:airgap`
- `jbhub-api:airgap`
- `mysql:8.4`
- `adminer:4`

번들 구성 파일 예시:

- `images.tar.gz`
- `docker-compose.airgap.yml`
- `docker-compose.airgap.docker-features.yml`
- `docker-compose.airgap.restore.yml`
- `.env.bundle`
- `IMPORT.md`

### 16.2 최종 반입 패키지 생성

현재 MySQL 데이터를 SQL dump로 포함한 최종 패키지를 만들 수 있습니다.

```bash
npm run docker:bundle:final
```

기본 출력:

- `final/jbhub-airgap-package.tar.gz`
- `final/mysql_jbhub.sql`

옵션 예시는 `scripts/prepare-final-airgap-package.mjs`를 참고하세요.

### 16.3 air-gap 환경에서 실행

예시 순서:

1. 이미지 로드
2. 환경 파일 준비
3. compose 실행

```bash
docker load -i images.tar.gz
docker compose --env-file .env.bundle -f docker-compose.airgap.yml up -d
```

Adminer까지 포함하려면 ops profile을 사용할 수 있습니다.

```bash
docker compose --env-file .env.bundle -f docker-compose.airgap.yml --profile ops up -d
```

## 17. 테스트와 CI

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

## 18. 데이터 초기화

가입 플랫폼/프로젝트 관련 데이터와 로컬 산출물을 정리할 때:

```bash
npm run platform:reset
```

이 스크립트는 아래 항목들을 비울 수 있습니다.

- 프로젝트 레코드
- Docker 배포/이미지 관련 DB 데이터
- 가입 신청 데이터
- 감사 로그
- 관리자 사용자 데이터
- `project-files/`
- `docker-uploads/`
- `docker-temp/`
- `backup/`

실행 전 데이터 손실 여부를 꼭 확인하세요.

## 19. Git 업로드 전 체크리스트

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
- `project-files/`
- `docker-uploads/`
- `docker-temp/`
- `upload-temp/`
- `.runtime/`
- `artifacts/`
- `backup/`
- `final/`, `final2/`
- `data/*.db*`
- 로그 파일

새 환경에서는 아래 순서로 다시 준비하면 됩니다.

```bash
npm ci
Copy-Item .env.example .env
npm run docker:up
npm run dev
```

## 20. 트러블슈팅

### `npm ci`가 실패할 때

- Node 버전이 `22.x`인지 확인하세요.
- 기존 `node_modules/`와 lockfile 충돌이 있었으면 정리 후 다시 시도하세요.

### API가 DB에 연결되지 않을 때

- `npm run docker:up`이 먼저 실행됐는지 확인하세요.
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` 값을 점검하세요.
- `npm run docker:logs`로 MySQL 상태를 확인하세요.

### 웹에서 API 호출이 안 될 때

- `http://127.0.0.1:8787/api/v1/health` 응답을 먼저 확인하세요.
- 로컬 개발에서는 `VITE_API_BASE_URL`을 비워두는 편이 안전합니다.
- `CORS_ALLOWED_ORIGINS` 설정을 확인하세요.

### Docker Desktop이 동작하지 않을 때

- Docker Desktop이 실행 중인지 확인하세요.
- `docker version` 또는 `docker compose version`으로 CLI 상태를 확인하세요.

## 21. 참고 파일

- `package.json`
- `.env.example`
- `.env.production.example`
- `.env.airgap.example`
- `docker-compose.yml`
- `docker-compose.airgap.yml`
- `Dockerfile.web`
- `Dockerfile.api`
- `server/index.js`
- `server/signup-platform.js`
- `scripts/build-docker-bundle.mjs`
- `scripts/build-airgap-stack-bundle.mjs`
- `scripts/prepare-final-airgap-package.mjs`
