# Telegram Admin Ops / CS Relay Runbook

## Source of truth and safe boundary

지입몰 PostgreSQL이 유일한 source of truth다. Telegram은 알림, 요약, Admin deep-link만 제공한다. Bot 메시지 삭제, Telegram 장애, webhook 재등록 실패가 Company/Ticket 원본 상태나 답변 기록을 제거해서는 안 된다.

중요 변경은 Telegram text/callback만으로 처리하지 않는다. 승인, 반려, 정지, 재활성화, 답변, 문의 완료는 로그인된 Admin 페이지에서 서버 권한 검증과 audit를 거친다.

## Required production configuration

| Variable | Purpose | Validation |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | Bot API server credential | Bot token 형식, client bundle/로그 노출 금지 |
| `TELEGRAM_ADMIN_CHAT_ID` | 단일 운영 chat/channel | webhook update chat과 exact match |
| `TELEGRAM_ADMIN_USER_IDS` | 허용 운영자 numeric IDs | 쉼표 구분; chat ID만으로 권한 부여 금지 |
| `TELEGRAM_WEBHOOK_SECRET` | Telegram secret header | 32자 이상, constant-time compare |
| `OPS_AUTOMATION_CRON_SECRET` | daily cron Bearer | 32자 이상, Telegram secret과 분리 |
| `NEXT_PUBLIC_SITE_URL` | Admin deep-link origin | production HTTPS origin |

하나라도 없거나 형식이 틀리면 Telegram 실행은 fail-closed한다. 앱 build와 고객 문의 저장은 계속 동작한다.

## Daily operation

1. Telegram daily digest에서 업체 승인, 미처리 문의, 긴급, 장기대기, 예외, 전송 실패 수를 확인한다.
2. `관리자에서 보기`로 `/admin/ops`, `/admin/companies/[id]`, `/admin/tickets/[id]`를 연다.
3. Company 처리 시 Company/member 상태, Jobs/Lease/Lead/Ads, entitlement/quota/credit, 변경 이력을 함께 확인한다.
4. Ticket 처리 시 상세 개인정보는 Admin에서만 확인하고 답변을 DB에 먼저 저장한다.
5. 일반 답변은 `WAITING_CUSTOMER`, 완료 답변은 `RESOLVED`로 기록한다.
6. Ops outbox의 `FAILED`가 있으면 error code와 provider 상태를 확인한 후 Admin `재시도`를 사용한다.

## CS relay flow

1. 고객이 `/support`에서 문의한다.
2. SupportTicket과 minimal-PII OpsEvent가 같은 transaction에 저장된다.
3. scheduler 또는 `/digest`가 outbox를 Telegram에 전달한다.
4. 운영자는 Telegram deep-link로 Admin Ticket 상세를 연다.
5. 답변은 `SupportTicketReply`와 AdminLog에 먼저 기록된다.
6. 고객은 capability URL에서 답변을 확인한다. 로그인 고객은 in-app notification도 받는다.
7. production email provider 연결 전 delivery 상태는 `WEB_ONLY`이며 이메일 전송 성공으로 위장하지 않는다.

## Telegram outage

- 고객 문의와 업체 신청은 정상 저장된다.
- 새 OpsEvent는 `PENDING`, 실패한 전송은 `FAILED`로 남는다.
- provider 오류는 stable error code만 기록하며 raw 응답/token은 저장하지 않는다.
- cron 재호출 또는 Admin 재시도로 bounded delivery를 수행한다.
- 10분 이상 `PROCESSING`인 claim은 stale recovery 대상이다.
- 5회 시도 후에는 자동 전송을 멈추고 Admin 확인을 요구한다.
- Telegram 복구 전에도 `/admin/companies`, `/admin/tickets`, `/admin/ops`에서 모든 원본 업무를 처리할 수 있다.

## Token and webhook secret rotation

1. 현재 failed/pending outbox 수와 마지막 성공 message ID를 기록한다.
2. secret manager에 새 Bot token과 별도의 새 webhook secret을 준비한다. 소스와 채팅에 값을 붙여넣지 않는다.
3. production 환경변수를 갱신하고 앱을 안전하게 restart/redeploy한다.
4. 새 HTTPS webhook URL에 새 `secret_token`을 설정한다.
5. 허용된 admin user/chat에서 `/digest` test-fire를 수행한다.
6. 잘못된 secret, user, chat이 각각 401/403으로 거부되는지 확인한다.
7. outbox 성공 전송을 확인한 뒤 이전 Bot token을 revoke한다.
8. 실패 이벤트를 Admin에서 재시도하고 데이터 유실이 없는지 확인한다.

## Scheduler

- Endpoint: `GET` 또는 `POST /api/cron/ops`
- Authorization: `Bearer <OPS_AUTOMATION_CRON_SECRET>`
- 권장 주기: KST 매일 운영 시작 전 1회 + outbox retry를 위한 짧은 주기
- 같은 날짜 daily digest는 `ops-digest:YYYY-MM-DD` unique key로 중복 생성되지 않는다.
- scheduler가 중복 호출되어도 event claim은 conditional update로 한 worker만 획득한다.

## Incident triage

| Signal | Check | Action |
| --- | --- | --- |
| `PROVIDER_NOT_CONFIGURED` | token/chat/user IDs/webhook secret/site URL | secret manager와 runtime env 수정 후 재시도 |
| `TELEGRAM_HTTP_401` | token 폐기/오타 | 새 token 배포와 webhook 재등록 |
| `TELEGRAM_HTTP_403` | Bot chat 접근/차단 | Bot membership과 admin chat ID 확인 |
| `PROVIDER_TIMEOUT` | Telegram/network 상태 | 원본 DB 확인 후 backoff 재시도 |
| `STALE_CLAIM` | worker 중단 | cron 재실행; 중복 message 가능성은 message ID/audit로 확인 |
| 반복 `PROVIDER_FAILURE` | 외부 provider response | secret을 로그에 출력하지 말고 adapter health와 Telegram status 확인 |

## Privacy checklist

- Telegram 메시지에 email, phone, 사업자 증빙, 상세 주소, 인증자료, 계좌, raw IP/UA를 넣지 않는다.
- 문의 제목도 phone/email/resident-number 모양을 redaction하고 80자로 제한한다.
- 상세 문의와 연락처는 Admin authorization 이후에만 조회한다.
- capability URL은 고객 답변 확인용 bearer secret처럼 취급하며 index하지 않는다.
- incident screenshot/log 공유 전에 ticket/company 식별자와 개인정보를 최소화한다.
