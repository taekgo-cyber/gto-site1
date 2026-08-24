# Production Database Migration Runbook

Track B 기준 production PostgreSQL migration 절차다. 개발용 `prisma migrate dev` 또는 `db push`를 production release 절차에 사용하지 않는다.

## Current contract

- Prisma schema: `prisma/schema.prisma`
- Prisma config: `prisma.config.ts`
- Migration directory: `prisma/migrations`
- Datasource: `DATABASE_URL`
- Production apply command: `prisma migrate deploy`
- Application startup과 schema mutation을 결합하지 않는다.

## Pre-deploy gate

1. release 대상 commit/branch와 migration directory를 고정한다.
2. production `DATABASE_URL` 값 자체를 출력하지 않고 대상 환경/DB 식별자를 별도 안전한 방법으로 확인한다.
3. `prisma validate`가 PASS인지 확인한다.
4. `prisma generate`가 PASS인지 확인한다.
5. production과 동일한 schema/migration chain을 staging 또는 disposable DB에서 먼저 검증한다.
6. production backup이 성공했고 restore 절차가 검증 가능한지 확인한다.
7. migration SQL에 destructive 변경(`DROP`, 대량 rewrite, NOT NULL 추가, 타입 축소 등)이 있으면 별도 리뷰 후 maintenance/expand-contract 절차를 사용한다.
8. application binary/build가 migration 이후 schema와 호환되는지 확인한다.

## Deploy sequence

1. 신규 write를 제한해야 하는 migration인지 판단한다.
2. 즉시 복구 가능한 backup/snapshot을 확보한다.
3. release runner에서 `prisma migrate deploy`를 **1회** 실행한다.
4. 실패하면 반복 실행 전에 원인과 `_prisma_migrations` 상태를 확인한다. 무조건 재실행하지 않는다.
5. 성공 후 migration status와 application startup을 확인한다.
6. `/api/health` liveness와 주요 read-only smoke flow를 확인한다.
7. 오류율/DB 연결 실패/latency 급증이 없음을 확인한 뒤 정상 트래픽으로 전환한다.

## Rollback policy

Prisma migration은 application code rollback과 DB schema rollback을 동일시하지 않는다.

- application-only 결함이고 새 schema가 이전 app과 호환되면 app version만 rollback한다.
- destructive schema 변경이 이미 적용된 경우 임의 reverse SQL을 즉시 실행하지 않는다.
- 데이터 손상 또는 비가역 schema 오류 시 검증된 backup/point-in-time recovery 절차를 우선한다.
- migration fix-forward가 더 안전한 경우 새 migration으로 교정하고 기존 migration 파일을 production 적용 후 수정/삭제하지 않는다.
- 이미 공유/production 적용된 migration history를 rewrite하지 않는다.

## Evidence to retain

값이나 개인정보가 아닌 다음 정보만 release evidence로 남긴다.

- release commit SHA
- migration directory/파일명 목록
- `prisma validate` 결과
- `prisma generate` 결과
- `prisma migrate deploy` exit status와 적용된 migration 이름
- backup/snapshot 식별자와 생성 시각(credential 제외)
- post-deploy health/smoke 결과

## Track B Gate 12 verification

2026-08-24 기준 현재 작업트리에서 DB mutation 없이 다음이 PASS했다.

- `prisma validate`
- `prisma generate`

실제 production `migrate deploy`와 restore rehearsal은 production/staging 인프라가 준비된 release 단계에서 수행한다.
