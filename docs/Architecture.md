## CS KPI Dashboard — Architecture

### 1. High-Level Overview

- **Frontend**: Next.js(App Router) + React, Tailwind UI
  - 주요 경로:
    - `/dashboard/overview` — CS KPI 메인 대시보드
    - `/dashboard/ticket-management` — Dev Summary + Conversation Viewer
    - `/dashboard/voc` — VOC 인사이트 리스트
    - `/leadership` — 리더십 뷰 (Health Score, VOC 요약)
- **Backend (API Routes)**: Next.js `app/api/*`
  - Zendesk / Supabase / OpenAI와 통신하는 thin API layer
  - 프론트엔드에서 직접 서드파티 API에 접근하지 않도록 캡슐화
- **Batch / Jobs**: Node 스크립트 (`scripts/*.ts`)
  - `scripts/sync-metrics.ts` 중심으로 KPI·VOC·DevSummary·TicketOverview 등을 미리 계산·캐시
- **Data Store**: Supabase(PostgreSQL)
  - KPI, VOC, Dev Summary, Ticket Overview, sync job 로그 저장소

간략한 블록 다이어그램:

```text
Zendesk API         OpenAI
     │                │
     └──────┬─────────┘
            ▼
    scripts/sync-metrics.ts
            │
            ▼
       Supabase (cache tables)
            │
   ┌────────┴────────┐
   ▼                 ▼
/api/* routes   Background tools
   │
   ▼
Next.js App (Dashboard / Ticket / VOC / Leadership)
```

### 2. 주요 모듈 구조

#### 2.1 Services Layer (`/services`)

- `zendeskClient.ts`
  - Zendesk REST API 래퍼
  - 티켓/인크리멘탈 커서/댓글(comments) 조회
- `brandResolver.ts`
  - 브랜드 정규화(`normalizeBrandId`) 및 alias → canonical 매핑
  - `SUPPORTED_BRANDS`, `getBrandQueryValues` 제공
- `precomputeCacheService.ts`
  - `ticket_overview_cache`, `voc_insights` 테이블 read/write
  - `getLatestTicketOverviewSnapshot(brand)` — 브랜드별 최신 스냅샷 조회
  - `getAllBrandsAggregatedTicketOverview()` — 모든 브랜드 스냅샷 집계 후 `brand='all'` payload 구성
  - `getLatestVocRows(weeks, brand?)` — VOC 인사이트 조회
- `kpiService.ts`
  - Leadership Health Score 및 Trend Risk 계산 로직
- `kpiCalculator.ts`
  - 주간 KPI 원시 계산(FRT, AHT, FCR, 분포 등)
- `devSummaryService.ts`
  - Zendesk 티켓 + 댓글을 읽어서 Dev Summary용 context 구축
  - OpenAI Dev Summary 호출 및 Supabase 캐시 갱신
- `openaiService.ts`
  - OpenAI 호출 래퍼
  - Dev Summary, VOC 인사이트 생성용 공통 함수
- `supabaseService.ts`
  - Supabase Client 생성 및 공유

#### 2.2 API Layer (`/app/api`)

- `app/api/kpis/route.ts`
  - Frontend KPI 그래프용 데이터 제공
  - 기본 brand: `all`
- `app/api/ticket-overview/route.ts`
  - Leadership + 일부 대시보드에서 사용하는 티켓 요약 스냅샷
  - `brand=all` → `getAllBrandsAggregatedTicketOverview()` 사용
  - `brand={canonical}` → 단일 브랜드 스냅샷
- `app/api/voc/route.ts`
  - VOC 인사이트 조회
  - `brand=all` → 브랜드 필터 없이 전체 조회
  - `forceRefresh=1` 옵션으로 내부 sync 트리거 호출 가능
- `app/api/dev-summary/route.ts`
  - Dev Summary 데이터 조회·재생성
  - OpenAI 호출과 Supabase 캐시 사이의 얇은 어댑터
- `app/api/kpis/route.ts`
  - KPI 조회 (주간 티켓 인입/해결, FRT, AHT, FCR, CSAT 등)
- `app/api/ticket-comments/route.ts`
  - 특정 티켓의 Zendesk 댓글 목록 반환
  - 프론트엔드에서 Conversation Viewer 모달용으로 사용
- `app/api/internal/*`
  - 배치 실행용 내부 엔드포인트 (`trigger-sync`, `voc-debug` 등)

#### 2.3 Frontend Components

- `components/AppLayout.tsx`
  - 전체 레이아웃 + 사이드바 네비게이션 + 브랜드 선택기
  - 브랜드 선택 시 현재 경로에 `?brand=` 쿼리를 붙여 리다이렉트
- `src/components/Dashboard.tsx`
  - CS KPI 메인 뷰
  - `/api/kpis`를 호출해 주간 그래프 및 카드 렌더링
- `components/DevSummaryTool.tsx`
  - Ticket Management 메인 UI
  - Dev Summary 목록 + 티켓 Conversation Viewer 모달
- `components/VOCDashboard.tsx`
  - VOC 인사이트 리스트
  - `/api/voc` 데이터 기반
- `components/LeadershipDashboard.tsx`
  - Health Score, VOC Top Issues, Risk Pill 등 리더십 뷰
  - 계산 로직은 `services/kpiService.ts`, 데이터는 `/api/ticket-overview`, `/api/voc` 활용

### 3. 데이터 플로우

#### 3.1 Sync 파이프라인 (Batch)

1. GitHub Actions / Cron이 `scripts/sync-metrics.ts` 실행
2. `zendeskClient`로 Zendesk Incremental Tickets + 메트릭셋 조회
3. `brandResolver.groupTicketsByBrand()`로 브랜드별로 티켓 그룹화
4. 각 브랜드에 대해:
   - `kpiCalculator`로 주간 KPI 계산, `kpis` 테이블에 upsert
   - Ticket Overview 집계 후 `ticket_overview_cache`에 upsert
   - VOC 분석(OpenAI) 결과를 `voc_insights`에 저장
   - Dev Summary 재계산이 필요한 티켓을 `dev_summary_cache`에 갱신

#### 3.2 요청/응답 플로우 예시 — Leadership

1. 사용자가 `/leadership?brand=league-of-kingdoms` 접속
2. `LeadershipDashboard`에서 병렬로 fetch:
   - `/api/ticket-overview?weeks=5&brand=league-of-kingdoms`
   - `/api/voc?weeks=3&brand=league-of-kingdoms`
3. 각 API는 Supabase 캐시 테이블에서 데이터를 읽어 JSON 응답으로 반환
4. `kpiService.calculateHealthFromSnapshots()`로 Health Score·Risk 계산
5. VOC 인사이트는 UI에서 headline·Top Issues·대표 티켓 요약 등으로 표현

#### 3.3 요청/응답 플로우 예시 — Ticket Conversation Viewer

1. 사용자가 Ticket Management에서 티켓 카드의 **View Conversation** 버튼 클릭
2. 프론트엔드에서 `/api/ticket-comments?ticketId=123` 호출
3. API는 `zendeskClient.getTicketComments(123)`로 Zendesk 댓글 조회
4. `plain_body`, `author_id`, `created_at`, `public`만 포함한 배열을 반환
5. UI 모달이 댓글 목록을 시간순으로 렌더링하고, 내부 노트(`public=false`)를 강조
6. OpenAI 호출은 전혀 발생하지 않음 (순수 뷰어)

### 4. Brand Handling & Aggregation

- 브랜드 관련 모든 문자열은 가능한 한 일관된 **canonical ID**를 사용:
  - `arena-z`, `league-of-kingdoms`, `lok-chronicle`, `lok-hunters`, `the-new-order`
- `normalizeBrandId`:
  - URL 쿼리, legacy Supabase 값, Zendesk 태그/커스텀필드에서 들어오는 모든 문자열을 정규화
  - `all`은 특별 케이스로 그대로 `all` 반환
- `getBrandQueryValues`:
  - Supabase 조회 시 canonical + legacy brand 모두 `.in()` 조회
- Aggregation:
  - `ticket_overview_cache`는 브랜드별로 한 행씩 저장
  - `getAllBrandsAggregatedTicketOverview()`는 이 행들을 읽어 합산/가중평균을 통해 `brand='all'`용 payload 생성
  - VOC의 경우, `brand` 필터를 생략하면 전체 브랜드를 모두 포함한 목록을 반환 (Leadership에서 전체 VOC 구조를 볼 때 사용)

### 5. OpenAI Integration (Safety Architecture)

- OpenAI 호출은 **services layer**에 한정 (`openaiService`, `devSummaryService`, `vocService` 등).
- API 라우트 및 프론트엔드에서는 OpenAI와 직접 통신하지 않음.
- **Token Safety 패턴**:
  - Zendesk 댓글 전체 / 긴 JSON을 그대로 전송 금지
  - Dev Summary:
    - `buildTokenSafeContext`로 최대 2개 텍스트 블록, 2000자 이내로 압축
  - VOC:
    - 사전 정의된 ticket 샘플/이슈 그룹만 전송, 결과는 `voc_insights`에 캐시

### 6. 배포 및 운영

- **환경 변수**
  - `ZENDESK_SUBDOMAIN`, `ZENDESK_EMAIL`, `ZENDESK_API_TOKEN`
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (또는 유사 권한 키)
  - `OPENAI_API_KEY`
  - `INTERNAL_SYNC_TOKEN` (내부 sync 트리거 보호용)
- **GitHub Actions / Cron**
  - `.github/workflows/kpi-sync.yml`에서 `scripts/sync-metrics.ts`를 주 2회 실행
  - 실패 시 Slack/Webhook 알림 등은 추후 추가
- **로컬 개발**
  - `npm run dev`로 Next.js dev 서버 실행
  - 장기 실행 job은 로컬에서 수동으로 `npx ts-node scripts/sync-metrics.ts` 실행

### 7. 참고 문서

- `docs/spec.md` — 제품 스펙 및 요구사항
- `docs/leadership-calculation-analysis.md` — Leadership Health Score / KPI 계산 상세

