# Production Observability Runbook

Track B Gate 14 기준이다. 특정 SaaS monitoring vendor를 아직 확정하지 않고도 production 운영에서 필요한 신호와 개인정보 경계를 정의한다.

## Health endpoints

### `/api/health`

- 목적: process/application liveness
- DB 또는 외부 서비스에 의존하지 않는다.
- 정상: HTTP 200 + `{ "status": "ok" }`
- load balancer가 process 생존 여부를 판단하는 데 사용한다.

### `/api/ready`

- 목적: application readiness
- PostgreSQL에 최소 `SELECT 1`을 수행한다.
- 정상: HTTP 200 + `{ "status": "ready" }`
- DB 연결 실패: HTTP 503 + `{ "status": "unavailable" }`
- DB URL, SQL error message, stack, credential은 응답하지 않는다.
- readiness 실패 로그도 error name만 남기고 원문 error/connection string을 기록하지 않는다.

## Minimum production signals

### Availability

- `/api/health` 5xx/timeout
- `/api/ready` 503/timeout
- edge/load-balancer 5xx 비율

### Application errors

- uncaught server errors
- `app_render_error`
- `root_render_error`
- `lease_render_error`
- `readiness_check_failed`

error log에는 가능한 한 아래 필드만 사용한다.

- event name
- timestamp (platform 제공 가능)
- request/trace ID (PII가 아닌 임의 ID)
- route/template name
- error class/name
- Next digest와 같은 opaque identifier

다음은 기본 로그 금지다.

- session cookie/token
- `AUTH_SECRET`, DB URL, API key
- raw request body
- 이름/전화/이메일
- raw IP 또는 full user-agent를 application analytics/log payload로 장기 보관
- full Error object가 credential/PII를 포함할 가능성이 있는 경로

### Database

hosting/provider에서 가능할 경우:

- connection saturation
- CPU/memory/storage
- slow query/latency
- failed connections
- backup/PITR 상태

### Product-critical operations

기존 aggregate KPI/도메인 데이터는 운영 판단에 활용하되 application infrastructure log와 분리한다.

- Lead unlock/match failures
- Advertisement impression/click/conversion ingestion failures
- payment/credit ledger failures(실제 payment 운영 시)

## Initial alert policy

실제 traffic baseline 확보 전 보수적으로 시작한다.

- health endpoint가 연속 3회 실패: 즉시 확인
- readiness가 5분 이상 지속 실패: DB/infra incident
- HTTP 5xx 비율이 5분 구간에서 5% 초과: 경보
- DB storage 80% 이상: 용량 경보
- backup job 실패: 다음 업무일이 아니라 즉시 확인

실제 트래픽과 false-positive를 관찰해 threshold를 조정한다.

## Release correlation

모든 production release에서 다음을 연결 가능하게 유지한다.

- release commit SHA
- deployment identifier
- migration identifier/list
- 배포 시작/완료 시각

오류 급증이 새 release와 시간상 연관되는지 바로 확인할 수 있어야 한다.

## Incident logging rule

1. 사용자 PII/secret을 복사해 incident 문서에 넣지 않는다.
2. opaque request/error identifier로 로그를 상호 참조한다.
3. 원인 분석에 PII가 꼭 필요하면 최소 권한 환경에서 제한적으로 조회하고 일반 evidence에 복제하지 않는다.
4. 원인/영향/조치/복구 시각/재발방지를 기록한다.

## Gate 14 status

2026-08-24 Track B에서는 liveness `/api/health`와 DB readiness `/api/ready`를 분리하고 본 observability/alert/log privacy 계약을 확정했다.

실제 APM/log aggregation/alert destination 연결은 production hosting 선택 후 외부 인프라 설정으로 남는다. 서비스 오픈 전 최소 health/readiness alert destination 1개는 실제 수신 테스트가 필요하다.
