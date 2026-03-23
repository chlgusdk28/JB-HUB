# JB-HUB Appliance 아키텍처 초안

## 1. 목표

JB-HUB를 폐쇄망 환경에 반입 가능한 단일 제품 형태로 묶는다.

- 웹 UI와 API를 같은 제품으로 배포한다.
- 컨테이너 엔진은 외부 사용자가 별도 설치하지 않아도 되게 한다.
- 오프라인 이미지 tar, 런타임 패키지, 서비스 템플릿을 같은 번들 안에 넣을 수 있게 한다.

## 2. 권장 배포 형태

초기 기준은 `리눅스 단일 노드 어플라이언스`다.

- 앱 프로세스: `server/sqlite-api.js`
- 정적 파일: `dist/`
- 데이터 저장소: SQLite
- 컨테이너 런타임: Docker Engine 또는 `nerdctl/containerd`
- 서비스 관리: `systemd`

## 3. 현재 반영된 코드 기반

### 3.1 런타임 어댑터

`server/container-runtime.js`

- `CONTAINER_RUNTIME_KIND`
- `CONTAINER_RUNTIME_BIN`
- `CONTAINER_RUNTIME_COMPOSE_COMMAND`

위 설정으로 런타임 바이너리와 compose 호출 방식을 분리했다.

### 3.2 컨테이너 제어 서버

`server/project-containers.js`

- 빌드
- compose up/ps
- 컨테이너 run/stop/rm
- 이미지 load

위 경로가 모두 런타임 어댑터를 거치도록 바뀌었다.

### 3.3 번들 스크립트

`scripts/build-appliance-bundle.mjs`

- `dist/` 빌드
- `server/`, `package.json`, `package-lock.json` 복사
- `deployment/appliance/linux` 템플릿 복사
- 런타임/이미지 오프라인 아카이브를 선택적으로 포함
- `artifacts/jbhub-appliance-YYYYMMDD/` 산출물 생성

## 4. 번들 구조

```text
artifacts/jbhub-appliance-YYYYMMDD/
  app/
    dist/
    server/
    package.json
    package-lock.json
  deployment/
    appliance/
      linux/
        jbhub-appliance.env.example
        jbhub-appliance.service
  images/
  runtime/
  appliance-manifest.json
  README.md
```

## 5. 추천 설치 흐름

1. 폐쇄망 반입 전 `npm run package:appliance` 실행
2. 필요하면 `APPLIANCE_IMAGE_ARCHIVE`, `APPLIANCE_RUNTIME_ARCHIVE`, `APPLIANCE_NODE_ARCHIVE` 지정
3. 생성된 번들을 대상 장비로 반입
4. `/opt/jbhub/app` 아래에 앱 파일 배치
5. `/etc/jbhub/jbhub-appliance.env` 작성
6. `jbhub-appliance.service`를 systemd에 등록
7. 컨테이너 엔진 패키지와 이미지 tar를 로드

## 6. 다음 구현 단계

### 6.1 엔진 부트스트랩

- 오프라인 Docker/nerdctl 패키지 설치 스크립트
- systemd 서비스 활성화
- 엔진 상태 진단 API

### 6.2 오프라인 이미지 로딩

- 제품 기본 이미지 묶음 tar 로드
- 초기 이미지 인덱스 저장
- 버전별 교체 정책 추가

### 6.3 설치 자동화

- `install-appliance.sh`
- `upgrade-appliance.sh`
- 백업/복구 스크립트

### 6.4 운영 기능

- 스토리지 사용량
- 엔진 로그 조회
- 번들 무결성 체크
- 오프라인 업데이트 패키지 검증
