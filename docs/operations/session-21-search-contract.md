# Session 21 Gate 0–1 — 통합 검색 감사 및 계약 고정

## 상태

- 기준 브랜치: `codex/s21-unified-search`
- 범위: 읽기 중심, 스키마 변경 없음
- UI/라우트/Header 변경: 없음(Gate 2 이후 검토)

## Gate 0 감사 결과

| 소스 | 기존 공개 조건 | Gate 1 검색 조건 | 주의점 |
| --- | --- | --- | --- |
| Jobs | `OPEN`, 미삭제, `publishedAt != null` | `OPEN`, 미삭제, `publishedAt <= now` | 미래 예약 공고를 fail-closed로 제외 |
| Lease | `PUBLISHED`, 미삭제, `publishedAt != null` | `PUBLISHED`, 미삭제, `publishedAt <= now` | 미래 예약 게시글을 fail-closed로 제외 |
| Blog | `PUBLISHED`, `publishedAt <= now` | 동일 | 비활성 카테고리는 결과 문맥에서 숨김 처리 예정 |

검색 대상으로 허용하지 않는 데이터는 CandidateLead, 비공개 Company 필드, 연락처,
CBT 정답/해설, 분석 이벤트, 크레딧/과금 원장, 관리자 데이터다.

## Gate 1 고정 계약

### 입력

- `q`: NFKC 및 공백 정규화 후 2–100자
- `domains`: `JOBS`, `LEASE`, `BLOG`; 생략 시 전부, 응답 순서는 canonical 순서
- `page`: 1–5
- `pageSize`: 서버 고정 20
- 반복 파라미터, 알 수 없는 도메인, 범위 밖 페이지는 오류로 종료한다.

### 출력 및 개인정보 경계

공개 DTO는 `id`, `domain`, `title`, `excerpt`, `href`, `context`, `publishedAt`,
`matchedOn`만 허용한다. 검색 소스의 본문은 매칭과 180자 요약 생성에만 사용하며
DTO에 원문 전체를 포함하지 않는다.

### 랭킹

1. 제목 완전 일치
2. 제목 접두 일치
3. 제목 포함
4. 본문 포함
5. 동점은 게시일 내림차순 → 도메인(Jobs, Lease, Blog) → ID 오름차순

랭킹은 AI나 사용자 추적 신호를 사용하지 않는 결정적 함수다.

### 페이지네이션 및 후보 제한

Gate 2 DAL은 소스별 후보 수를 제한하고, 응답에 `candidateLimited`를 명시해야 한다.
최대 5페이지 제한은 무제한 `contains` 검색과 깊은 페이지 탐색을 방지하기 위한
초기 운영 안전장치다. 정확한 후보 제한값과 `totalMatches` 계산 방식은 실제 쿼리
계획을 측정한 뒤 Gate 2에서 고정한다.

## Gate 2 진입 전 중지점

- 이 계약의 제품/운영 검토
- `/search` 동적 페이지의 canonical/noindex 정책 승인
- 소스별 후보 제한과 PostgreSQL 실행 계획 측정
- Header 검색 진입점은 라우트 및 모바일 E2E 완료 후 별도 적용
- 알림/추천 영속 모델은 통합 검색과 분리해 후속 게이트에서 검토

