# Backup & Recovery Runbook

Track B Gate 13 기준이다. Production 인프라가 아직 확정되지 않은 부분은 구현 완료로 과장하지 않고 release gate로 관리한다.

## 보호 대상

1. PostgreSQL application database
   - 사용자/기업/지입/리드/광고/결제/CBT 운영 데이터
   - Prisma migration history (`_prisma_migrations`)
2. 업로드 파일 저장소
   - 현재 구현은 `STORAGE_PROVIDER=local`만 지원
   - production에서는 `UPLOAD_DIR`이 durable volume에 있어야 한다.
3. 배포 설정
   - secret 값 자체가 아니라 환경변수 이름/구성, release commit SHA, migration 목록
4. Git repository
   - application source와 migration history는 Git remote가 canonical copy다.

## Minimum production policy

실제 공급자/SLA 확정 전 Track B 기본 목표값:

- DB RPO: 24시간 이하. 가능하면 managed PostgreSQL PITR/continuous backup 사용.
- DB RTO: 4시간 이하를 목표로 restore rehearsal에서 실측한다.
- 업로드 RPO: 24시간 이하 또는 object/durable storage 자체 versioning 정책.
- backup retention: daily 7일 + weekly 4주를 최소 출발점으로 검토한다.
- production launch 전 최소 1회의 실제 restore rehearsal이 필요하다.

위 수치는 임시 운영 기준이며 hosting/DB 상품의 실제 보장조건으로 대체되어야 한다.

## Database backup

### Preferred production path

Managed PostgreSQL을 사용할 경우 provider snapshot/PITR를 우선한다.

- 자동 backup/PITR 활성화 여부 확인
- retention 확인
- backup 암호화 확인
- production DB와 다른 failure domain에 backup이 존재하는지 확인
- restore 권한을 최소 인원/서비스 계정으로 제한

### Logical backup fallback

자가 운영 PostgreSQL에서는 PostgreSQL 16과 호환되는 `pg_dump` custom format을 사용한다.

예시 운영 절차:

```text
pg_dump --format=custom --no-owner --no-acl --file=<secure-backup-path> <production-connection>
```

- connection string/비밀번호를 shell history 또는 로그에 직접 출력하지 않는다.
- backup 파일은 application web root와 local upload directory 밖에 둔다.
- 완료 후 파일 존재, 크기, checksum, 생성시각을 기록한다.
- logical dump만으로 충분하다고 가정하지 말고 restore test를 수행한다.

## Upload backup

현재 local-only storage는 production host의 ephemeral filesystem에 두면 안 된다.

Production 허용 조건:

- `UPLOAD_DIR`이 durable persistent volume에 매핑되어 있고,
- 해당 volume의 snapshot/backup 정책이 있고,
- DB backup과 업로드 backup의 시점 차이를 이해하고 있으며,
- 복구 후 attachment DB row와 실제 파일의 일관성을 smoke test할 수 있어야 한다.

Object storage adapter가 도입되면 object versioning/lifecycle/replication 정책으로 이 절차를 교체한다.

## Restore rehearsal

Production 출시 전 staging/disposable environment에서 다음을 실제 수행한다.

1. clean PostgreSQL 16 인스턴스를 준비한다.
2. 선택한 production-format backup을 restore한다.
3. migration history가 존재하고 Prisma schema와 호환되는지 확인한다.
4. release application을 복구 DB에 연결한다.
5. `/api/health` liveness를 확인한다.
6. 로그인/목록 조회 등 read-only smoke flow를 확인한다.
7. durable upload snapshot도 복원하고 대표 첨부 이미지가 조회되는지 확인한다.
8. restore 시작~서비스 usable 시점까지 시간을 재 RTO를 기록한다.
9. backup 생성 시각~장애 가정 시점 차이로 실제 RPO를 기록한다.

## Incident recovery decision

- application binary 결함: DB가 정상이고 schema 호환성이 있으면 app rollback 우선.
- migration/schema 결함: 임의 reverse SQL보다 Gate 12 migration runbook에 따라 fix-forward 또는 검증된 backup/PITR 선택.
- 데이터 손상: write traffic 차단 후 restore/PITR 범위를 결정한다.
- upload 손실: DB restore만으로 해결되지 않는다. 동일 시점에 가까운 upload snapshot을 복구한다.
- credential 노출: restore와 별개로 credential/`AUTH_SECRET` 회전 절차를 병행한다.

## Recovery evidence

secret/PII 없이 다음만 남긴다.

- incident/rehearsal 시각
- release commit SHA
- backup/snapshot 식별자
- backup 생성 시각
- checksum(논리 dump 사용 시)
- restore target 식별자
- restore 시작/완료 시각
- measured RPO/RTO
- migration status
- health/smoke PASS/FAIL

## Gate 13 status

2026-08-24 Track B에서는 코드베이스의 PostgreSQL 16, Docker local named volume, local-only upload storage 구조를 확인하고 본 runbook을 확정했다.

실제 production backup 생성/PITR 설정/restore rehearsal은 production hosting 및 durable storage가 준비되어야 실행할 수 있으므로 **release 전 외부 인프라 gate**로 남는다. 특히 ephemeral filesystem에 local upload storage를 배포하는 것은 NO-GO다.
