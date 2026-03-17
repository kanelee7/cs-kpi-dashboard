## CS KPI Dashboard — Product Spec

### 1. 프로젝트 목표

- **단일 대시보드**로 CS 운영(티켓 볼륨·품질 지표·VOC)을 한눈에 보여준다.
- 브랜드별(`arena-z`, `league-of-kingdoms`, `lok-chronicle`, `lok-hunters`, `the-new-order`) 및 **전체 합산(`all`)** 관점을 모두 지원한다.
- Zendesk / Supabase / OpenAI를 활용해 **사전 계산(precompute)** 된 데이터를 사용하여, 운영자가 언제든지 빠르게 조회할 수 있도록 한다.
- Dev 팀/운영팀/리더십이 **같은 데이터 파이프라인**을 공유하지만, 각자에 맞는 화면(Overview, Ticket Management, VOC, Leadership)을 갖도록 한다.

### 2. 대상 사용자 & 주요 사용 시나리오

- **CS 운영 리더 / 매니저**
  - 매주 혹은 매일 `CS Dashboard`에서 티켓 인입·해결 트렌드, FRT, AHT, FCR 등 핵심 KPI를 확인한다.
  - 브랜드별 성과를 비교하거나 전체 합산(`all`)으로 운영 부담을 본다.
- **에이전트 리더 / QA**
  - `Ticket Management`에서 티켓 요약(Dev Summary)과 전체 대화 내용을 열람하고, 품질 이슈나 프로세스 개선 포인트를 찾는다.
- **경영진 / 리더십**
  - `Leadership` 뷰에서 Health Score, Volatility, VOC 구조 이슈를 간단히 확인하고, CS 조직의 안정성과 리스크를 파악한다.

### 3. 상위 기능 목록

1. **CS Dashboard (`/dashboard/overview`)**
   - 브랜드 또는 `all` 기준 주간 KPI(티켓 인/해결, FRT, AHT, FCR, CSAT) 차트
   - week label / brand 필터링
2. **Ticket Management (`/dashboard/ticket-management`)**
   - DevSummary 기반 티켓 목록: 티켓 ID, Subject, 한 줄 요약(영/한), 우선순위, 상태 등
   - **View Conversation 모달**: Zendesk 티켓 댓글 전체(plain text) 조회, 내부 노트 강조
3. **VOC Dashboard (`/dashboard/voc`)**
   - VOC 인사이트(Top Issues, Weekly Summary, 대표 티켓 요약, Trend Changes) 리스트
   - 브랜드 또는 `all` 기준 조회
4. **Leadership Dashboard (`/leadership`)**
   - Health Score(복합 점수) 및 리스크 등급
   - ticket-overview + VOC 인사이트를 결합한 서머리
5. **백그라운드 동기화**
   - GitHub Actions / Vercel Cron 등을 사용한 `scripts/sync-metrics.ts` 정기 실행
   - Supabase 캐시에 KPI, Ticket Overview, VOC, Dev Summary 저장

### 4. 브랜드 & 필터링 규칙

- **지원 브랜드**: `arena-z`, `league-of-kingdoms`, `lok-chronicle`, `lok-hunters`, `the-new-order`
- **정규화 규칙**: `services/brandResolver.ts`의 `normalizeBrandId` / `getBrandQueryValues` 사용
  - 별칭(예: `lok`, `brand-a`) → canonical brand로 매핑
  - legacy brand 값 포함 조회 시 `.in('brand', getBrandQueryValues(canonical))`
- **기본값**
  - URL에 `brand` 파라미터가 없으면: **`all` (전체 합산)** 을 기본으로 사용
  - AppLayout의 브랜드 셀렉트:
    - `All Brands` 선택 시 `brand` 파라미터 제거 (혹은 `all`)
    - 특정 브랜드 선택 시 `?brand={canonical}`을 각 페이지 URL에 부착
- **API 규칙**
  - `/api/kpis`: `brand` 없으면 `all`
  - `/api/ticket-overview`: `brand` 필요. `brand=all`일 경우 모든 브랜드 스냅샷을 집계한 결과 반환.
  - `/api/voc`: `brand` 필요. `brand=all`일 경우 브랜드 필터 없이 전체 VOC 인사이트를 반환.

### 5. 데이터 소스 및 저장소

- **Zendesk**
  - 티켓, 메트릭(`metric_set`), 댓글(conversations)
  - 사용 API:
    - Incremental Tickets: 주간 KPI 계산용 원본
    - Ticket Comments: 티켓 상세 대화 / Dev Summary context
- **Supabase**
  - `kpis`: 주간 KPI 원시 결과 (브랜드별)
  - `ticket_overview_cache`: Leadership·Overview에서 쓰는 집계 페이로드
  - `voc_insights`: VOC 인사이트 및 요약
  - `dev_summary_cache`: Dev Summary 결과 캐시
  - `sync_job_runs`: 배치 실행 이력
- **OpenAI**
  - Dev Summary, VOC 인사이트 생성에 사용
  - **중요**: Zendesk 댓글 전체를 그대로 넘기지 않고, 토큰 세이프한 요약 입력만 전달.

### 6. Dev Summary / Ticket Comments 스펙 (토큰 세이프 모드)

#### 6.1 Zendesk 댓글 조회 (`getTicketComments`)

- 위치: `services/zendeskClient.ts`
- API: `GET /api/v2/tickets/{ticket_id}/comments`
- 최대 100개까지만 수집 (`MAX_TICKET_COMMENTS`)
- 반환 필드:
  - `plain_body` (없을 경우 `body` fallback, 최종적으로 빈 문자열 허용)
  - `author_id`
  - `created_at`
  - `public` (true/false)

#### 6.2 Ticket Management — Conversation Viewer

- 위치:
  - API: `app/api/ticket-comments/route.ts`
  - UI: `components/DevSummaryTool.tsx`
- 동작:
  - 티켓 카드의 **"View Conversation"** 버튼 클릭 시 `/api/ticket-comments?ticketId={id}` 호출
  - 응답: `{ ticketId, comments: ZendeskTicketComment[] }`
  - UI에서 시간 오름차순 정렬 후 렌더링
  - `public === false`인 댓글은 **Internal note** 배지 + 하이라이트 배경으로 표시
- 제약:
  - 모달 열릴 때만 fetch
  - ESC / 백드롭 클릭 / 닫기 버튼으로 닫힘
  - OpenAI 호출 없음 (순수 뷰어)

#### 6.3 Dev Summary — Token Safe Context

- 위치:
  - `services/devSummaryService.ts` — `buildTokenSafeContext`, `syncOpenTicketDevSummaries`
  - `services/openaiService.ts` — `DevSummaryTicketInput.contextForSummary`
- 규칙:
  - 각 티켓별로 **최대 2개의 텍스트 블록**만 사용:
    1. Original Description (티켓 description)
    2. Latest Internal Note **또는** Latest Public Reply
  - 각 블록은 **최대 800자**로 잘라내기
  - 전체 컨텍스트 문자열은 **최대 2000자**로 제한
  - 댓글이 5개 이상이어도 **전체 배열을 절대 그대로 전송하지 않음**
- OpenAI 입력:
  - `contextForSummary`가 있을 때만 사용, 없으면 `descriptionSnippet` fallback
  - JSON payload에 전체 댓글 배열은 포함하지 않는다.

### 7. Leadership Dashboard 스펙 (요약)

- 상세 계산식은 `docs/leadership-calculation-analysis.md` 참고.
- 이 스펙 문서에서는 역할만 요약:
  - `/api/ticket-overview` + `/api/voc`를 병렬 호출
  - `calculateHealthFromSnapshots()`로 Health Score / Trend Risk 산출
  - VOC 인사이트에서 Top Issue 1개 또는 Weekly Summary를 헤드라인으로 사용
  - 브랜드 필터/전체 합산(`all`) 모두 지원

### 8. 비기능 요구사항 (NFR)

- **성능**
  - 주요 페이지(Overview, Ticket Management, VOC, Leadership)는 대부분 Supabase 캐시를 통해 **1초 이내 응답**을 목표로 한다.
  - Zendesk Incremental API / OpenAI 호출은 **배치(job)** 에서만 실행하고, 사용자가 직접 대시보드 열람 시에는 캐시만 읽는다.
- **안정성**
  - 캐시 테이블이 비어 있거나 테이블 스키마가 없는 경우, API는 의미 있는 에러 메시지(`Run sync job`)를 반환한다.
- **토큰 비용 관리**
  - Dev Summary / VOC 모두, **필요 최소 정보만** OpenAI로 보낸다.
  - 댓글·원문 전문을 그대로 보내는 패턴은 금지.
- **확장성**
  - 브랜드가 추가될 경우 `SUPPORTED_BRANDS`·`BRAND_ALIAS_MAP`·UI 옵션만 확장하면 되도록 설계한다.

### 9. 앞으로의 확장 아이디어

- Business Impact 섹션 실제 구현 (MAU, 결제/환불 지표 연동)
- 에이전트 레벨 KPI (에이전트별 FRT/AHT/FCR)
- SLA Breach 예측, 티켓 우선순위 추천 등 ML 기능

