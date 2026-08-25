# S22 Company Ops / Admin Automation / Telegram Ops

## Status

- Result: `COMPLETE / PASS`
- Baseline: `8470b4660df614f81edfac15710f6ce03a765d62`
- Branch: `codex/s22-company-ops`
- Worktree: `C:\Users\taekg\gto-site1-s22`
- Production deploy / push / production migration: not performed
- Existing S21 worktree untracked files: preserved unchanged

## Gate 1 audit

| 영역 | S21 기준 현재 구현 | 부족한 점 | S22 필요 여부 | S22 구현 방향 |
| --- | --- | --- | --- | --- |
| Company 신청 | Company/CompanyMember, 사업자번호 검증, PENDING 신청·수정·재신청 | 운영 이벤트 전달 없음 | 필요 | 신청 transaction 안에 Telegram-neutral OpsEvent outbox 추가 |
| Company lifecycle | PENDING → ACTIVE/REJECTED, ACTIVE write boundary | ACTIVE 이후 일시정지/재활성화·사유 이력 없음 | 필요 | 기존 enum을 유지하고 ACTIVE ↔ SUSPENDED만 허용, reason/actor/time을 AdminLog에 기록 |
| Company public | Jobs/Lease에 업체명이 일부 노출됨 | 업체 목록·상세·SEO·공개 경계 없음 | 필요 | ACTIVE/non-deleted 업체만 `/companies`와 `/companies/[id]`에 최소 공개 |
| Admin Company | PENDING 목록과 승인/반려 상세 | 전체 검색/상태 필터/페이지네이션/운영 context 없음 | 필요 | 기존 route를 확장해 members, Jobs, Lease, Lead, Ads, entitlement, quota, credit, audit를 결합 |
| Lead/Ads/Credit | 별도 운영·metric·idempotency 기반 존재 | 업체 상세에서 함께 판단하기 어려움 | 필요 | 새 시스템을 만들지 않고 Company 상세에 read-only context로 연결 |
| Audit | AdminLog에 승인/반려 기록 | 일반 상태 변경과 CS 처리 이력 없음 | 필요 | Company status, Ticket reply/status, outbox retry에 bounded AdminLog 추가 |
| Ops automation | Blog cron과 광고 만료 처리 존재 | 회사 승인/문의/예외 일일 요약 없음 | 필요 | 기존 Bearer cron 패턴을 재사용한 `/api/cron/ops`와 KST daily digest |
| User notifications | S21 DB-backed `/notifications` | 관리자 모바일 운영 전달과 혼합 위험 | 분리 필요 | InAppNotification은 고객 알림에 유지하고 Admin Telegram outbox를 별도 모델로 구성 |
| CS | 독립 문의 모델·답변 화면 없음 | 웹 접수, 상태 추적, 관리자 답변 전체 부재 | 필요 | SupportTicket/Reply, capability URL, Admin inbox/reply/status 구현 |

## Locked product contract

- 기존 `CompanyStatus`의 `PENDING`, `ACTIVE`, `SUSPENDED`, `REJECTED`만 사용한다.
- 승인/반려는 기존 동작을 유지하며 일반 운영 상태 변경은 `ACTIVE ↔ SUSPENDED`만 허용한다.
- 공개 업체 페이지는 `ACTIVE`이면서 `deletedAt = null`인 업체만 조회한다.
- 사업자번호, 대표자명, 전화, 이메일, 상세 주소, 회원과 상품 운영 정보는 공개 페이지에 노출하지 않는다.
- 고객 문의와 Telegram 전송은 DB가 source of truth다. Telegram 장애가 원본 업무를 실패시키지 않는다.
- Telegram에서 중요 상태를 직접 바꾸지 않는다. 메시지의 inline URL은 인증된 Admin deep-link로만 연결한다.
- S22 고객 전달 기본 채널은 capability URL 기반 웹 상태/답변 화면이다. 이메일은 provider-neutral boundary만 잠그고 외부 provider는 후속 연결한다.

## Implemented

### Company Page

- `/companies`: ACTIVE 업체 검색·페이지네이션·공개 게시물 수
- `/companies/[id]`: 소개, 지역, 공개 Jobs/Lease, CTA, canonical/Open Graph metadata
- sitemap에 업체 목록/ACTIVE 상세 추가
- 공개 DAL select에서 사업자번호·대표자 연락처·내부 운영 정보를 제외

### Company Ops / Admin Automation

- `/admin/companies`: 이름/사업자번호/대표자 검색, 상태 필터, 20개 페이지네이션
- `/admin/companies/[id]`: 회원/권한, Jobs, Lease, Lead, Ads, Credit, entitlement, quota, audit context
- 기존 승인/반려 유지
- ACTIVE ↔ SUSPENDED 전환, 필수 사유, conditional update, owner in-app notification, AdminLog
- `/admin/ops`: 오늘 처리할 업무 수, outbox 상태/실패/재시도

### Support Ticket / CS Relay

- `/support`: 업체등록/계정/게시물/결제·환불/광고/신고/기타 문의
- 이름과 이메일/전화 중 하나, 제목, 내용, 중요도 검증
- HMAC 시간 버킷 rate limit. raw IP/UA와 raw contact hash input은 저장하지 않음
- 문의 생성과 minimal-PII OpsEvent를 같은 DB transaction에 기록
- `/support/tickets/[token]`: noindex capability URL로 상태와 관리자 답변 제공
- `/admin/tickets`: 검색, 상태/유형 필터, 페이지네이션, 긴급 표시
- `/admin/tickets/[id]`: 문의 context, 답변, 상태, audit, 고객 확인 링크
- 답변은 DB에 먼저 기록되고 로그인 고객에게는 S21 in-app notification도 전달
- 이메일 provider 미연결 시 `WEB_ONLY`로 명시해 fake email success를 만들지 않음

### Telegram Admin Ops

- server-only env 기반 Bot API provider abstraction
- Bot token, admin chat ID, admin Telegram user allowlist, webhook secret을 모두 fail-closed 검증
- `/api/telegram/webhook`: secret header, chat+actor 이중 권한, update_id receipt replay protection
- `/digest` command만 운영 요약을 실행하며 중요 변경은 Admin deep-link 확인으로 제한
- 업체 신청, 신규 문의, daily digest, 운영 예외를 표현할 수 있는 일반 OpsEvent outbox
- 최소 payload: 업무 ID, 유형, 마스킹 이름, PII redaction 요약, Admin path
- delivery claim, stale lock recovery, bounded retry/backoff, stable error code, Telegram message ID 기록

### Ops Digest

- KST 일자 dedupe key로 하루 한 digest만 생성
- 업체 승인, 미처리/긴급/장기대기 문의, owner 없는 ACTIVE 업체, 기간 종료 ACTIVE 광고, 전송 실패 집계
- `/api/cron/ops`는 기존 cron과 동일한 32자 이상 Bearer secret 패턴 사용

## Schema and migration

- Migration: `20260825233000_add_s22_company_ops`
- Local migration count: 20
- Added enums: ticket category/status/priority, reply author/delivery, ops event type/status
- Added models:
  - `SupportTicket`
  - `SupportTicketReply`
  - `SupportRateLimitBucket`
  - `OpsEvent`
  - `TelegramWebhookReceipt`
- Destructive SQL: none
- Local PostgreSQL apply/status: PASS
- Representative Ticket + OpsEvent create/read/update/cleanup: PASS

## Security review

- Admin pages and every mutation re-check ACTIVE ADMIN from DB.
- Company write authorization remains owner/member/company-state scoped.
- Public Company DAL is allowlist-select based and ACTIVE/non-deleted constrained.
- Anonymous ticket access requires a high-entropy `accessToken`; invalid path-shaped tokens fail before DB query.
- Telegram webhook requires the configured secret header, the configured admin chat, and an allowed numeric Telegram user ID.
- `update_id` is the replay/idempotency primary key. A duplicate is acknowledged without re-running commands.
- Telegram callback/message content cannot approve, reject, suspend, reply, or resolve records directly.
- Ops payload redacts phone/email/resident-number-shaped content and never contains raw IP/UA, business proof, contact fields, tokens, or secrets.
- Support rate limiting stores only an HMAC digest and hourly window.
- Ticket create, reply, state transitions and Company state transitions are bounded server-side; client actor IDs are ignored.
- Provider errors map to stable codes; raw provider responses and tokens are not persisted.

## Verification

| Check | Result |
| --- | --- |
| S22 focused | 7 files / 29 tests PASS |
| Full regression | 124 files / 1,251 tests PASS |
| TypeScript | PASS (`next typegen` + `tsc --noEmit`) |
| ESLint | PASS, 0 errors / 14 pre-existing warnings |
| Prisma validate/generate | PASS |
| Local migration | 20/20 applied, schema up to date |
| Representative DB CRUD | PASS; smoke rows cleaned |
| Next production build | PASS |
| Public Company browser | list/detail/Jobs boundary PASS |
| Support browser | create → capability status page PASS |
| Admin authorization | anonymous Admin request redirected to login PASS |
| Admin Company/Ticket/Ops | authenticated local smoke PASS |
| Mobile | 390px, no document horizontal overflow on Support/Admin surfaces PASS |
| Browser console | 0 warning/error entries |
| Telegram adapter/webhook | mock provider, secret, actor, replay, failure/retry tests PASS |
| Production Telegram | NOT RUN — external secrets/bot intentionally absent |

## External TODO

| Deadline | Item | Completion evidence |
| --- | --- | --- |
| BEFORE S23 | Production Telegram Bot 생성, token/chat ID/admin user allowlist 발급 | secret manager keys populated; no value committed |
| BEFORE S23 | HTTPS webhook 등록과 secret header test-fire | authorized `/digest` succeeds; wrong secret/user/chat returns 401/403 |
| BEFORE S23 | Production scheduler에 `/api/cron/ops` 연결 | 한 KST 일자 digest 1개와 outbox retry metric 확인 |
| BEFORE S24 | Production email provider와 sender domain 결정 | provider adapter contract test, SPF/DKIM/DMARC, bounce policy |
| BEFORE PRODUCTION | S22 production migration 실행 | backup/checkpoint 후 migration status 20/20 |
| BEFORE PRODUCTION | Telegram 장애/rotation drill 및 alert 연결 | failed outbox retained, retry succeeds, old token revoked |
| BEFORE PRODUCTION | Support abuse secret을 AUTH_SECRET과 분리 | 32+ byte secret rotation and rate-limit smoke |
| POST-LAUNCH | 24시간 장기대기/긴급 기준과 시간당 5건 limit 튜닝 | 실제 volume/SLA 기반 운영 리뷰 |
| POST-LAUNCH | Email delivery/retry/bounce 운영 지표 | WEB_ONLY에서 provider-backed delivery로 점진 전환 |

## Deferred

- Naver External Content Distribution / 네이버 블로그 게시
- 실제 PG 결제, PG webhook, 환불/정산
- SMS, push notification
- 대규모 AI CS bot, vector DB
- production deploy / production migration

## Next

`NAVER EXTERNAL CONTENT DISTRIBUTION GATE: GO`
