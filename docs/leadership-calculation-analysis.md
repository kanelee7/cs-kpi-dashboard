# Leadership Dashboard — 계산 방법 분석

Leadership 페이지(`/leadership`)는 **CS Health(복합 지표)**, **운영 안정성 트렌드**, **VOC 구조 이슈**, **임원 권고 액션**을 한 화면에 제공합니다. 이 문서는 각 지표의 계산 방법과 데이터 흐름을 정리합니다.

---

## 1. 데이터 소스 및 흐름

### 1.1 API 호출

Leadership Dashboard는 아래 두 API를 병렬로 호출합니다:

| API | 용도 | 쿼리 파라미터 |
|-----|------|---------------|
| `GET /api/ticket-overview` | 티켓 KPI 스냅샷 | `weeks=5`, `brand` |
| `GET /api/voc` | VOC(AI 기반 인사이트) | `weeks=3`, `brand` |

### 1.2 ticket-overview 데이터

- **출처**: Supabase `ticket_overview_cache` 테이블
- **생성**: `scripts/sync-metrics.ts` 실행 시 Zendesk 티켓 데이터를 기반으로 사전 계산
- **캐시 페이로드**: `TicketOverviewCachePayload` (`services/precomputeCacheService.ts`)

```ts
interface TicketOverviewCachePayload {
  ticketsIn: number;
  ticketsResolved: number;
  frtMedian: number;           // First Response Time 중앙값 (시간 단위)
  avgHandleTime: number;
  fcrRate: number;
  csatAverage: number;
  frtDistribution: {...};
  fcrBreakdown: { oneTouch, twoTouch, reopened };
  weeklyTicketsIn: number[];
  weeklyTicketsResolved: number[];
  weeklyLabels: string[];
  weeklyRanges: string[];
  trends: { frt: number[]; aht: number[]; fcr: number[]; csat: number[] };
  latestWeekLabel: string;
  latestWeekRange: string;
  latestWeekStartDate: string;
  latestWeekEndDate: string;
}
```

### 1.3 VOC 데이터

- **출처**: Supabase `voc_insights` 테이블
- **생성**: `sync-metrics` 실행 시 VOC 분석 서비스(OpenAI 활용)로 사전 생성
- **내용**: 주간 top issues, weekly summary, ticket summaries, trend changes 등

---

## 2. CS Health (복합 지표) 계산

**위치**: `services/kpiService.ts` — `calculateHealthFromSnapshots()`

### 2.1 Sub Metrics (기본 지표)

`getPayloadFromSnapshot(current)`로 `TicketOverviewCachePayload`를 추출한 뒤 다음 세 지표를 계산합니다.

#### 2.1.1 Resolution Rate (해결률)

```
resolutionRate = (ticketsResolved / ticketsIn) × 100
```

- **ticketsIn**: 가장 최근 주의 `weeklyTicketsIn[-1]` 또는 `ticketsIn`
- **ticketsResolved**: 가장 최근 주의 `weeklyTicketsResolved[-1]` 또는 `ticketsResolved`
- **범위**: 0~100% 클램핑

#### 2.1.2 Reopen Rate (재오픈률)

```
reopenRate = (fcrBreakdown.reopened / total) × 100
total = oneTouch + twoTouch + reopened
```

- **범위**: 0~100% 클램핑

#### 2.1.3 FRT Median (First Response Time 중앙값, 시간)

- `payload.frtMedian` 값을 그대로 사용 (이미 sync 단계에서 시간 단위로 저장됨)

### 2.2 Sub Scores (점수화)

각 sub metric을 0~100 점수로 변환합니다.

| 지표 | 공식 | 특성 |
|------|------|------|
| Resolution Score | `clamp(resolutionRate, 0, 100)` | 선형 (1:1 매핑) |
| Reopen Score | `clamp(100 - reopenRate, 0, 100)` | **역산** (높을수록 나쁨 → 점수 반전) |
| FRT Score | `clamp(100 - 25 × log10(1 + frtHours), 0, 100)` | **로그 역산** (시간越长, 점수↓) |

FRT 공식 요약:
- 1h → ≈ 92.5점
- 4h → ≈ 85점
- 12h → ≈ 72점
- 24h → ≈ 65점

### 2.3 Composite Score (복합 점수)

```
compositeScore = resolutionScore × 0.5 + reopenScore × 0.2 + frtScore × 0.3
```

**가중치**:
- Resolution: 50%
- Reopen: 20%
- FRT: 30%

### 2.4 Critical Overrides (치명적 하한 적용)

아래 **어느 하나라도** 해당되면 composite를 **최대 50점으로 제한**합니다:

| 조건 | 임계값 |
|------|--------|
| FRT Critical | `frtHours > 12` |
| Reopen Critical | `reopenRate > 15%` |
| Resolution Critical | `resolutionRate < 60%` |

즉, 12시간 초과 FRT, 15% 초과 재오픈률, 60% 미만 해결률은 “치명적 리스크”로 간주됩니다.

### 2.5 이전 시점 비교(Previous Snapshot)

- `previous` 스냅샷이 있으면: 이전 payload로 composite를 계산해 비교
- 없고 `trends.frt` 길이가 2 이상이면: **현재 vs 이전 주 FRT**만 사용해 synthetic previous composite 계산
- 그 외: `previousComposite = null`, volatility/trend risk는 기본값

### 2.6 Volatility & Risk

| 항목 | 공식 | 용도 |
|------|------|------|
| Volatility Delta | `currentScore - previousScore` | 전 기대비 변화량 |
| High Volatility | `\|delta\| > 15` | 급변 여부 표시 |
| Primary Trend Risk | 변화율 50%↑ → red, 30%↑ → yellow, 그 외 green | 리스크 등급 |

---

## 3. Sparkline (트렌드 미니차트)

**위치**: `components/LeadershipDashboard.tsx` — `Sparkline` 컴포넌트

### 3.1 Resolution Rate Sparkline

```
values = (weeklyTicketsResolved[i] / weeklyTicketsIn[i]) × 100  (각 주별)
```

- 주간 해결률(%)
- 최근 6개 주만 사용

### 3.2 FRT Sparkline

- `payload.trends.frt` 배열 그대로 사용 (주별 FRT 중앙값)

### 3.3 Reopen Rate Sparkline

- 현재: 빈 배열 `[]` 전달 → 비어 있음 (향후 확장 가능)

---

## 4. 원시 KPI 계산 (sync-metrics 단계)

Leadership는 **사전 계산된 캐시**를 사용하며, 원시 KPI는 `scripts/sync-metrics.ts`에서 `kpiCalculator.calculateKPIsForWeek()`를 호출해 생성합니다.

### 4.1 FRT (First Response Time)

**위치**: `services/kpiCalculator.ts`

- **기간**: 해당 주 종료일 기준 **과거 45일** (`FRT_WINDOW_DAYS`)
- **대상**: 해당 기간에 **생성된** 티켓
- **메트릭 추출**: Zendesk `metric_set` 우선, fallback 순서:
  1. `first_reply_time_minutes`
  2. `reply_time_in_minutes` (business/calendar)
  3. `first_reply_time_in_seconds`
- **결과**: 유효한 값들의 **중앙값(median)** → `frtMedian` (시간 단위로 변환)

### 4.2 FRT Distribution

| 버킷 | 조건 (minutes → hours) |
|------|-------------------------|
| 0-1h | hours ≤ 1 |
| 1-8h | 1 < hours ≤ 8 |
| 8-24h | 8 < hours ≤ 24 |
| >24h | hours > 24 |
| No Reply | FRT 없음 |

### 4.3 AHT (Average Handle Time)

- **기간**: 해결일 기준 과거 45일
- **대상**: 해당 기간에 **해결된** 티켓
- **계산**: `full_resolution_time` (분) → 시간으로 변환 후 평균
- **제한**: 168시간(7일) 초과 제외

### 4.4 FCR (First Contact Resolution)

- **대상**: AHT와 동일한 해결 티켓 세트
- **분류**:
  - **reopened**: `metric_set.reopens > 0`
  - **oneTouch**: `replies < 2` 또는 `touches < 2`
  - **twoTouch**: 그 외

```
fcrPercent = (oneTouch / totalFCR) × 100
totalFCR = oneTouch + twoTouch + reopened
```

---

## 5. VOC (Voice of Customer)

### 5.1 데이터 소스

- `GET /api/voc` → `getLatestVocRows()` → `voc_insights` 테이블

### 5.2 Leadership에서 사용하는 필드

| 필드 | 용도 |
|------|------|
| `top_issues` / `topIssues` | 구조적 이슈 5개 |
| `weekly_summary` | 주간 요약 |
| `ticket_summaries` | 대표 티켓 요약 |
| `trend_changes` | 전주 대비 변화 설명 |

### 5.3 Impact Narrative

- `topIssues[0]` 존재 시: `"Top structural issue this period: "{이슈}"."`
- 없고 `weekly_summary` 존재 시: `weekly_summary`
- 둘 다 없으면: `"Customer voice signals are stable..."`

---

## 6. Business Impact 섹션 (미구현)

다음 3가지 지표는 **수식만 정의**되어 있고, 실제 데이터는 아직 연결되지 않았습니다:

| 지표 | 정의 | 상태 |
|------|------|------|
| Elasticity Index | `% Ticket Change - % MAU Growth` | MAU 시계열 미연결 |
| Tickets per 1,000 MAU | `Tickets / (MAU / 1000)` | MAU 미연결 |
| Retention Risk | 결제 티켓 vs 환불/이탈 상관계수 | 환불/이탈 플래그 스키마 미정의 |

---

## 7. 요약 다이어그램

```
Zendesk API (tickets, metric_sets)
         │
         ▼
  sync-metrics.ts
         │
    ┌────┴────┐
    ▼         ▼
kpiCalculator   vocService
(FRT, AHT, FCR) (OpenAI VOC)
    │         │
    └────┬────┘
         ▼
  Supabase cache
  (ticket_overview_cache, voc_insights)
         │
         ▼
  /api/ticket-overview, /api/voc
         │
         ▼
  LeadershipDashboard
         │
    ┌────┴────┐
    ▼         ▼
kpiService   VOC UI
(Health)   (Narrative)
```

---

## 8. 참고 파일

| 파일 | 역할 |
|------|------|
| `services/kpiService.ts` | CS Health 복합 지표 계산 |
| `services/kpiCalculator.ts` | 원시 KPI (FRT, AHT, FCR) 계산 |
| `services/precomputeCacheService.ts` | 캐시 스키마·접근 |
| `components/LeadershipDashboard.tsx` | UI 렌더링 |
| `scripts/sync-metrics.ts` | 주기적 캐시 갱신 |
