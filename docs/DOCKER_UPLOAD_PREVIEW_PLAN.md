# Docker 업로드/빌드/미리보기 기획안

## 1. 목표

JB-HUB 프로젝트 상세 화면에서 사용자가 컨테이너 실행용 파일을 올리고, 그 결과를 다음 두 방식 중 하나로 확인할 수 있게 한다.

- 사이트 내부 미리보기
- 로컬 Docker 기반 미리보기

단, 초기 버전은 운영 복잡도와 보안 리스크를 줄이기 위해 `사이트 내부 미리보기`를 우선 지원하고, `로컬 미리보기`는 2단계 확장 범위로 둔다.

## 2. 문제 정의

현재 저장소에는 일반 프로젝트 파일 업로드 흐름은 이미 존재한다.

- 프로젝트 파일 업로드/조회: `server/index.js`
- 파일 브라우저 UI: `src/app/components/FilesTab.tsx`
- 업로드 API 클라이언트: `src/app/lib/projects-api.ts`
- 런타임 저장 경로: `server/runtime-paths.js`

반면 Docker 업로드는 아래 요소가 빠져 있다.

- Docker 전용 업로드 규칙
- 빌드 작업 큐
- 빌드 로그 조회
- 실행/중지/재배포 흐름
- 사이트 미리보기 URL 라우팅
- 보안 정책과 리소스 제한

즉, 필요한 것은 "Dockerfile 업로드 기능"이 아니라 "프로젝트 소스 스냅샷 기반 컨테이너 빌드/미리보기 플랫폼"이다.

## 3. 핵심 원칙

### 3.1 프로젝트 파일 업로드를 재사용한다

Docker 관련 파일도 별도 스토리지로 따로 받지 않고, 기존 프로젝트 파일 트리 아래에 저장한다.

예시:

```text
.runtime/storage/project-files/<projectId>/
  containers/
    web-preview/
      Dockerfile
      .dockerignore
      jbhub.container.yml
      app/
        ...
```

이 방식의 장점:

- 기존 파일 업로드 UX 재사용 가능
- 프로젝트 단위 접근 권한 재사용 가능
- Docker 소스와 일반 프로젝트 문서가 같은 맥락에 유지됨

### 3.2 빌드는 업로드 원본이 아니라 스냅샷으로 수행한다

사용자가 빌드 버튼을 누른 시점의 파일 집합을 별도 경로로 복사한 뒤 그 복사본으로 빌드한다.

예시:

```text
.runtime/storage/docker/
  contexts/<jobId>/
  logs/<jobId>.log
  artifacts/<jobId>/
```

이 방식의 장점:

- 빌드 중 업로드 변경과 충돌하지 않음
- 재현 가능한 빌드 기준점 확보
- 실패 분석과 로그 보존이 쉬움

### 3.3 초기 버전은 단일 웹 컨테이너 미리보기만 지원한다

MVP 범위에서는 다음만 지원한다.

- 단일 Dockerfile
- 단일 컨테이너
- 단일 외부 노출 포트
- HTTP 기반 미리보기

초기 범위에서 제외한다.

- docker-compose 필수 지원
- 다중 컨테이너 오케스트레이션
- DB/Redis 등 부속 컨테이너 자동 기동
- 브라우저만으로 원격 사용자의 로컬 Docker 직접 제어

## 4. 업로드 규칙

### 4.1 권장 표준 폴더

프로젝트 안에서 아래 경로만 Docker 업로드 대상으로 인정한다.

```text
containers/<deploymentName>/
```

예시:

```text
containers/web-preview/
  Dockerfile
  .dockerignore
  jbhub.container.yml
  app/
```

### 4.2 필수 파일

- `Dockerfile`
- `jbhub.container.yml`
- 빌드 컨텍스트에 필요한 실제 소스 파일

### 4.3 사실상 필수 파일

- `.dockerignore`

없으면 `node_modules`, `.git`, 빌드 산출물 등이 컨텍스트에 섞여 성능과 보안 문제가 생길 수 있다.

### 4.4 권장 파일

- `README.md`
- `.env.example`
- 헬스체크용 경로 또는 스크립트

## 5. 메타파일 규격

플랫폼이 알아야 하는 정보는 Dockerfile만으로 충분하지 않다. 따라서 플랫폼 전용 메타파일을 필수화한다.

파일명:

- `jbhub.container.yml`

예시:

```yaml
version: 1
kind: web-preview

build:
  context: .
  dockerfile: Dockerfile

run:
  containerPort: 3000
  healthcheckPath: /health
  readinessTimeoutSec: 60

env:
  required:
    - NODE_ENV
  optional:
    - API_BASE_URL
```

필수 필드:

- `version`
- `kind`
- `build.context`
- `build.dockerfile`
- `run.containerPort`

권장 필드:

- `run.healthcheckPath`
- `run.readinessTimeoutSec`
- `env.required`
- `env.optional`

## 6. 사용자 흐름

### 6.1 프로젝트 작성자

1. 프로젝트 파일 탭에서 `containers/web-preview/` 폴더를 업로드한다.
2. 프로젝트 상세의 `Container` 탭으로 이동한다.
3. 감지된 Dockerfile 목록 중 실행 대상을 선택한다.
4. `빌드 시작`을 누른다.
5. 빌드 로그를 확인한다.
6. 성공 시 `미리보기 열기`를 누른다.
7. 필요하면 `재배포`, `중지`, `삭제`를 수행한다.

### 6.2 관리자

1. 전체 빌드/배포 현황을 본다.
2. 실패 작업을 확인한다.
3. 장시간 살아 있는 preview를 정리한다.
4. 리소스 초과 또는 정책 위반 컨테이너를 중지한다.

## 7. 화면 기획

### 7.1 프로젝트 상세에 `Container` 탭 추가

현재 `QuietProjectDetail.tsx`에 파일 탭이 있으므로, 여기에 별도 탭을 다시 추가한다.

표시 정보:

- 감지된 컨테이너 정의 목록
- 마지막 빌드 상태
- 마지막 배포 상태
- preview URL
- 로그 버튼
- 빌드/중지/재배포 버튼

### 7.2 관리 콘솔에 운영 카드 추가

현재 관리자 콘솔에 서비스 개요가 있으므로 아래 항목을 추가한다.

- 활성 build job 수
- 활성 preview 수
- 실패 build 수
- 만료 예정 preview 수

## 8. 백엔드 구조

### 8.1 모듈 분리

권장 파일:

```text
server/
  docker-routes.js
  docker-worker.js
  docker-runner.js
  docker-proxy.js
  docker-validators.js
```

역할:

- `docker-routes.js`: API 엔드포인트
- `docker-worker.js`: job polling, build 실행, 로그 저장
- `docker-runner.js`: container run/stop/remove
- `docker-proxy.js`: preview URL 라우팅 규칙
- `docker-validators.js`: Dockerfile/메타파일/정책 검증

### 8.2 런타임 저장 경로

`server/runtime-paths.js`에 아래 경로를 추가한다.

```text
.runtime/storage/docker/
  contexts/
  logs/
  artifacts/
```

필요 시:

- `containers/` 또는 `previews/` 경로 추가

## 9. 데이터 모델

현재 코드에 아래 테이블이 일부 남아 있어 재사용 가능하다.

- `docker_images`
- `docker_build_jobs`
- `docker_deployments`

초기 버전에서 각 테이블의 역할:

### 9.1 `docker_build_jobs`

- 어떤 프로젝트에서
- 어떤 Dockerfile과 contextPath로
- 누가
- 언제
- 어떤 상태로
- 어떤 로그를 남기며
- 어떤 image/deployment를 만들었는지

### 9.2 `docker_images`

- 빌드 성공한 이미지 메타데이터
- image name/tag/id
- exposed ports
- load/build 결과

### 9.3 `docker_deployments`

- 실제 실행 중인 preview
- host port
- endpoint URL
- container id/name
- 상태
- 시작/종료 시각

## 10. API 기획

MVP 기준 제안 엔드포인트:

- `GET /api/v1/projects/:id/containers`
- `POST /api/v1/projects/:id/containers/build`
- `GET /api/v1/projects/:id/containers/build-jobs`
- `GET /api/v1/containers/build-jobs/:jobId`
- `GET /api/v1/containers/build-jobs/:jobId/logs`
- `POST /api/v1/containers/deployments/:deploymentId/start`
- `POST /api/v1/containers/deployments/:deploymentId/stop`
- `DELETE /api/v1/containers/deployments/:deploymentId`

응답에 포함할 주요 값:

- `status`
- `dockerfilePath`
- `contextPath`
- `imageReference`
- `endpointUrl`
- `hostPort`
- `startedAt`
- `finishedAt`

## 11. 빌드/실행 방식

### 11.1 사이트 내부 미리보기

권장 방식:

- builder worker가 `docker buildx build --load`
- runner가 `docker run -d -p <hostPort>:<containerPort>`
- reverse proxy가 `/preview/<deploymentId>` 또는 서브도메인으로 연결

권장 우선순위:

1. 서브도메인 preview
2. 필요 시 path prefix preview

이유:

- 많은 앱이 `/` 기준 경로를 가정함
- path prefix 프록시는 정적 파일/라우팅이 자주 깨짐

### 11.2 로컬 미리보기

중앙 서버에서 사용자의 로컬 Docker를 브라우저만으로 직접 제어할 수는 없다.

따라서 진짜 로컬 실행이 필요하면 별도 `local agent`가 필요하다.

구조:

1. 사이트가 빌드 요청을 생성
2. 로컬 에이전트가 서명된 job을 가져감
3. 로컬 Docker로 build/run 수행
4. 상태/로그/URL만 사이트에 보고

초기 버전에서는 제외하고 2단계 확장 기능으로 둔다.

## 12. 보안 정책

### 12.1 업로드 정책

기존 프로젝트 파일 업로드 제한과 별도로 Docker 업로드 전용 검증이 필요하다.

차단 대상:

- `.env`
- 개인 키/인증서 파일
- `docker.sock` 마운트 유도 설정
- host network 사용
- privileged 실행 유도

### 12.2 빌드 정책

- 외부 레지스트리 직접 pull 금지
- 내부 레지스트리 prefix만 허용
- build 시간 제한
- build 로그 길이 제한
- 컨텍스트 크기 제한

### 12.3 실행 정책

- `--privileged` 금지
- host network 금지
- docker.sock mount 금지
- CPU/메모리 제한 필수
- 자동 만료 TTL 적용
- preview당 1개 외부 포트만 허용

## 13. 폐쇄망/금융권 고려사항

폐쇄망 환경에서는 Dockerfile이 외부 이미지를 직접 참조하면 실패한다.

따라서 사전 검증 항목:

- `FROM`이 내부 레지스트리 또는 사전 승인 이미지인지 검사
- 외부 패키지 설치 명령이 내부 mirror 기준인지 점검
- 필요한 base image 목록을 운영팀이 사전 제공

운영 가이드:

- preview는 내부망 전용 주소로만 노출
- 레지스트리 mirror 또는 사내 registry 사용
- 빌드 노드와 서비스 노드 분리 권장

## 14. 실패 시나리오와 대응

### 14.1 Dockerfile은 있지만 메타파일이 없음

- 빌드 버튼 비활성화
- `jbhub.container.yml` 필요 안내 표시

### 14.2 컨테이너는 떴지만 준비 완료 안 됨

- readiness timeout 이후 `degraded` 또는 `failed`
- 로그와 healthcheck 결과 노출

### 14.3 빌드는 성공했지만 preview 라우팅 실패

- `image ready / deployment failed`로 분리 표시
- 재시도 버튼 제공

### 14.4 업로드 이후 파일이 바뀜

- 현재 실행 preview는 유지
- 새 빌드 요청은 새 snapshot 기준으로 생성

## 15. MVP 범위

초기 구현 범위:

- 프로젝트 파일 아래 `containers/*` 스캔
- `Dockerfile + jbhub.container.yml` 검증
- build job 생성
- 로그 polling
- 단일 HTTP preview 실행
- preview 중지/재배포
- 관리자 상태 집계

제외 범위:

- docker-compose
- 멀티컨테이너
- 로컬 agent
- 장기 보관 registry push
- 이미지 취약점 스캐닝 자동화

## 16. 2단계 확장

- `local agent` 기반 로컬 실행
- compose 지원
- 배포 템플릿 재사용
- 환경변수 Secret 분리 관리
- 이미지 취약점 스캔
- 레지스트리 push/pull 캐시

## 17. 성공 기준

### 사용자 관점

- 프로젝트에서 컨테이너용 파일을 쉽게 올릴 수 있다
- 빌드 상태와 실패 원인을 즉시 확인할 수 있다
- 성공 시 사이트에서 바로 앱을 열어볼 수 있다

### 운영 관점

- preview 컨테이너가 무한히 남지 않는다
- 리소스 제한과 TTL이 적용된다
- 정책 위반 이미지는 사전에 차단된다

## 18. 구현 권장 순서

1. Docker 전용 메타파일 스펙 확정
2. `containers/*` 스캔 API 추가
3. build job 생성 API 추가
4. worker와 로그 저장 구현
5. 단일 preview 실행 구현
6. 프로젝트 상세 `Container` 탭 구현
7. 관리자 현황 화면 연결
8. 보안/정리 정책 강화

## 19. 최종 제안

가장 현실적인 1차 버전은 아래와 같다.

- 프로젝트 파일 업로드 구조 재사용
- `containers/<name>/Dockerfile` + `jbhub.container.yml` 강제
- 단일 웹 컨테이너 preview만 지원
- 사이트 내부 preview 우선 지원
- 로컬 Docker 실행은 차후 `local agent`로 분리

이 방향이 현재 저장소 구조와 가장 잘 맞고, 운영 리스크를 가장 낮추면서도 사용자가 체감하는 가치가 크다.
