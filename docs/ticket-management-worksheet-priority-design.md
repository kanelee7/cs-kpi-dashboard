# Ticket Management: Worksheet-Driven Summary & Priority (Design Doc)

> 목적: 구글 시트(worksheet)에 들어가는 “메인 이슈 요약” 및 “우선도/검증” 데이터를
> 티켓 매니지먼트 화면에서 바로 정렬/표시하고, 여러 티켓을 빠르게 비교·검토할 수 있게 한다.

## 1. 현재 문제/요구사항 정리

1. 모더레이터가 시트에 아래 정보를 기록한다.
   - `J열`: 이슈 요약(예: “Re: [3MERGED] …”, 또는 “A2Z voucher exchange issue …” 같은 한 줄/요약)
   - `C열`: 티켓 번호(앱스스크립트가 UID/Wallet/assignee 등을 자동 등록)
   - 우선도(priority)는 Zendesk 기본 필드로는 신뢰도가 낮거나 비어 있는 경우가 많아, 시트에 “우선도 칸”을 추가/활용하려 한다.
2. 화면에서는 다음이 필요하다.
   - 우선도/검증 기준으로 티켓을 정렬하고, 이유(근거)를 함께 표시
   - 한 번에 여러 티켓을 비교하거나, 빠르게 수정하며 결과를 확인
3. worksheet 기반 접근은 “열람 권한이 필요”하므로, 브라우저에서 직접 읽지 않고(보안),
   서버/Apps Script 같은 중간 계층을 통해 읽기 권한을 통제한다.

## 2. 핵심 선택지(옵션)

### 옵션 C (권장): Worksheet가 ‘단일 진실(ground truth)’에 가깝게 동작
- 시트의 `J열(main issue summary)` + `priority(추가 컬럼)`를 티켓 목록의 1차 정렬 기준으로 사용
- 장점: moderator가 실제로 보고/검증한 값이라 품질이 높고, “검증/우선도”를 앱에서 재현 가능
- 단점: 시트 read API(또는 Apps Script)를 반드시 구현해야 함

### 옵션 B: Zendesk internal note / CS internal context 기반
- internal note가 API로 접근 가능하고 권한이 맞다면 “답변/조치 근거”를 더 정확히 반영 가능
- 장점: worksheet보다 더 ‘현재 상태’ 반영 가능
- 단점: API 토큰/권한/레이트리밋 이슈가 발생할 수 있음

> 이 문서는 “옵션 C 중심”으로 설계한다.
> 옵션 B는 나중에 “fallback” 또는 “추가 신호”로 붙이는 형태를 권장한다.

## 3. 데이터 모델(시트 컬럼 제안)

최소 컬럼(권장):
- `C열`: `ticketId` (티켓 번호, 앱스스크립트가 UID/Wallet 등 매핑에 사용)
- `J열`: `main_issue_summary` (이슈 요약)

우선도용 컬럼(하나만 추가해도 됨):
- `K열`: `priority_level` (예: Low / Med / High) 또는
- `L열`: `priority_score` (예: 0~100 또는 1~5)

정렬 이유를 UI에 보여주기 위한 메타(추가 권장):
- `M열`: `priority_confidence` (예: High/Med/Low 또는 0~1)
- `N열`: `worksheet_updated_at` (ISO string 또는 사람이 입력한 타임스탬프)

### 값 포맷 규칙(중요)
- `priority_score`가 있으면 점수 기반 정렬이 쉬움
- `priority_level`만 있으면 매핑 테이블로 점수화(예: Low=1, Med=2, High=3)
- 비어있으면 “자동 우선도(Auto Priority)”로 fallback

## 4. Apps Script 기반 worksheet 읽기(열람 권한 문제 해결)

> 목표: 앱이 worksheet 전체를 브라우저에서 읽지 않게 하고,
> moderator 값이 필요한 row만 안전하게 가져온다.

### 4.1. 권장 아키텍처

1) Google Apps Script Web App (또는 API 엔드포인트)
- 예: `https://script.google.com/macros/s/{SCRIPT_ID}/exec`
- 쿼리 파라미터로 `op`을 받음

2) 앱 서버(Next.js)에서만 호출
- 클라이언트(React)에서 Apps Script를 직접 호출하지 않음
- Next API 라우트에서 호출하고 캐시(필수)

### 4.2. 필요한 엔드포인트(예시)

`GET op=fetchRowByTicketId&ticketId=12345`
- 응답:
```json
{
  "ticketId": 12345,
  "mainIssueSummary": "Re: [3MERGED] … 한 줄 요약",
  "priority": { "level": "High", "score": 90, "confidence": "High" },
  "updatedAt": "2026-03-23T12:34:56Z"
}
```

`POST op=fetchRows&ticketIds=123,456,789`
- 대량 조회로 rate limit 감소

### 4.3. 보안
- 웹앱에 간단한 `token` 쿼리/헤더 검사
- 예:
  - `token` 값은 `.env.local` / GitHub secrets에 저장
  - 프론트에는 노출하지 말고 Next API에서만 사용

## 5. 티켓 목록 정렬 전략(우선도 표시/근거 포함)

### 5.1. 최종 우선도 계산(추천)
정렬 우선순위는 아래 규칙으로 결정:

1) worksheet의 `priority_score`(또는 level→score)가 있으면 그 값을 사용
2) worksheet priority가 비어있으면 fallback 사용(Auto Priority)
   - fallback 예시(검증/복기 가능해야 함):
     - `Zendesk priority` (있다면) + `status` + `age(created_at)` 기반
     - 가능하면 운영 리스크 proxy(예: 브랜드/헬스 신호)도 가미
3) worksheet 값과 fallback 값이 섞일 때는 UI에 “Priority source”를 라벨로 표시
   - 예: `Priority source: Worksheet` / `Priority source: Auto`

> 중요한 점: “왜 이 티켓이 위에 있나”를 사용자가 이해할 수 있어야 검증이 쉬움.

### 5.2. “검증/우선도” 가시화
티켓 카드(리스트)에는 다음을 함께 표시:
- 우선도 배지: `High / Med / Low` 또는 점수 구간
- 근거:
  - `Priority source: Worksheet`
  - `priority_confidence` 표시(있을 경우)
- health risk는 (옵션) 보조로 표시 가능

## 6. 표시/수정/비교 UI 설계(여러 개 보기 포함)

### 6.1. 버튼/모드 제안
리스트 상단 또는 카드 우측에 “보기 모드”를 둔다.

- 모드 1: `Worksheet Priority + Summary`
  - J열 요약을 primary summary로 사용
  - priority는 시트 값을 사용
- 모드 2: `Auto Priority (fallback)`
  - 시트 priority가 비어있는 티켓만 auto로 정렬
- 모드 3: `Combined`
  - 시트 요약은 primary
  - 우선도는 “시트 있으면 우선” + “없으면 auto”

### 6.2. 여러 개 수정/비교
현재 `DevSummaryTool`은 “단일 티켓 상세(대화 보기)”에 집중되어 있으므로,
다음 UI를 추가하는 것을 권장:

1) 체크박스(또는 멀티 선택)
- 여러 티켓을 선택하고
- “Compare” 버튼을 누르면
  - 선택된 티켓의 worksheet 요약/priority/요약 출처를 한 화면에 보여줌

2) 정렬/필터 버튼
- `Priority: High only`, `Open only`, `In progress only`
- `Updated recently` 같은 기준

3) 수정 흐름
- “Edit priority”는 실제로 시트에 쓰는 것이므로
  - 앱에서는 “수정 요청”만 보내고
  - 실제 저장은 Apps Script / 외부 워크플로로 처리

> 구현 단계에서 “읽기 기반 정렬/표시”부터 먼저 끝내고,
> “수정”은 저장/동기화가 안정화된 뒤 추가하는 것을 권장한다.

## 7. API/캐시 설계(성능/레이트리밋)

### 7.1. 캐시 목표
- worksheet read는 비용이 있으므로,
  - `ticketId` 단위로 캐시
  - `updatedAt` 변경이 감지되면 TTL을 짧게

### 7.2. 동작 흐름
1) DevSummaryTool에서 티켓 목록을 가져옴(기존 로직 유지)
2) 선택된 범위(paged) 또는 화면에 보이는 row들에 대해
   - Next API (`/api/worksheet-row?ticketIds=...`) 호출
3) UI에 priority badge/summary source 반영

## 8. 구현 체크리스트(나중에 바로 실행하기 위한 기준)

1) Google Sheet 컬럼 추가
   - `priority_score` 또는 `priority_level`
   - `worksheet_updated_at` (가능하면)
2) Apps Script Web App 엔드포인트 구현
   - `fetchRowByTicketId` 또는 `fetchRows`
   - token 기반 접근 제어
3) Next.js API 라우트 추가(서버에서만 호출)
   - sheet 요청 → 응답 정규화(JSON schema 고정)
   - 캐시(메모리 or 간단 DB or edge cache)
4) DevSummaryTool UI 반영
   - 정렬: priority_score desc (동점 시 updatedAt desc 등)
   - 배지: Priority source / confidence 표시
   - 필터/정렬/모드 버튼 추가
5) 실패/누락 처리
   - worksheet row가 없으면 Auto Priority
   - confidence 없으면 기본 표시(또는 생략)

## 9. 번역/요약 품질 제약(Subject 메타 오염 방지)

티켓의 `subject`에는 `Re:` / `[3MERGED]` / 이메일 / 해시 등 스레드 메타가 섞일 수 있다.
이 값이 한국어 요약(oneLineSummaryKo)에 섞이거나 번역되어 이상해지는 문제를 막기 위해,
요약/번역 단계에서 아래 규칙을 강제한다.

1) 요약의 “이슈 내용”은 가능한 한 `context`(description + 최신 internal note 또는 public reply 등)에서만 생성
2) `subject`는 식별자(또는 fallback 입력)로만 취급하고, 스레드 메타를 요약에 포함하지 않음
3) `Re:` 접두사, bracket 토큰(예: `[3MERGED]`)은 **그대로 보존**하며 번역/해석하지 않음
4) 이메일/핸들/해시 같은 기술 문자열은 **그대로 보존**하며 번역하지 않음
5) subject가 thread metadata만 포함한 경우, context 기반으로만 요약을 생성

## 10. Zendesk “Missing configuration” 디버깅 관련 참고(중요)

티켓 대화(Conversation) API는 Zendesk 환경변수를 필수로 요구한다.
- `ZENDESK_SUBDOMAIN`
- `ZENDESK_EMAIL`
- `ZENDESK_API_TOKEN`

worksheet 기반 우선도(C 옵션)를 먼저 구현하면,
대화 열람 실패가 UI 전체를 막지 않도록 “분리”가 가능해진다.

