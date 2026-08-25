# 후속업무 4 — Production 출시 준비 실행 계획

## 목적과 안전 경계

이 계획은 POST-S20 canonical commit을 production에 올리기 전 필요한 외부 인프라
게이트를 실행 순서대로 고정한다. secret 값은 Git, 명령 로그, 스크린샷, 운영
evidence에 남기지 않는다. Production DB write, 배포, 유료 provider 호출은 대상
환경 확인과 명시적 실행 승인이 끝난 뒤에만 수행한다.

## 현재 판정

| 항목 | 현재 상태 | 판정 |
| --- | --- | --- |
| 코드/마이그레이션 로컬 검증 | POST-S20 PASS | 준비됨 |
| production 환경변수 검사 | 자동 preflight 추가 | 실제 환경에서 미실행 |
| DB backup/PITR | 공급자 미지정 | BLOCKED |
| restore rehearsal | 복구 대상 미지정 | BLOCKED |
| Blog AI provider smoke | key/provider 승인 없음 | BLOCKED |
| cron scheduler | 플랫폼/주기 미지정 | BLOCKED |
| durable uploads | local-only adapter | NO-GO until durable volume verified |
| health/readiness alert | 목적지 미지정 | BLOCKED |

## 4-1. Release 대상과 변경 불변성 고정

1. GitHub remote에 integration branch와 canonical `main`을 반영한다.
2. release commit SHA를 기록하고 해당 SHA의 migration 18개를 고정한다.
3. production 배포 후보를 다시 빌드하고 test/lint/typecheck/build 결과를 연결한다.
4. 이후 migration 파일 수정/삭제를 금지하고 추가 변경은 새 migration으로만 처리한다.

완료 기준: remote `main` SHA와 release SHA가 일치하고 tracked worktree가 clean.

## 4-2. Production 환경 계약 검사

1. 배포 플랫폼 secret store에 필수 변수를 넣는다.
2. release runner와 동일한 환경에서 `npm run production:preflight`를 실행한다.
3. 출력에는 변수명과 PASS/FAIL만 남기고 실제 값은 남기지 않는다.
4. FAIL 0건이어도 MANUAL 3건은 자동 승인으로 간주하지 않는다.

필수 변수: `DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_SITE_URL`,
`LEAD_MAX_CONTACT_UNLOCKS_PER_LEAD`, `BLOG_AI_BASE_URL`, `BLOG_AI_API_KEY`,
`BLOG_AI_MODEL`, `BLOG_AUTOMATION_CRON_SECRET`, `STORAGE_PROVIDER`, `UPLOAD_DIR`.

완료 기준: FAIL 0건, canonical HTTPS origin 확인, secret store audit 완료.

## 4-3. DB backup 및 migration release

1. managed PostgreSQL의 자동 backup/PITR/retention/암호화를 확인한다.
2. release 직전 snapshot 또는 PITR restore point를 생성하고 식별자만 기록한다.
3. 별도 staging/disposable DB에 동일 backup을 복원한다.
4. 복구 DB에서 migration history와 release build 호환성을 확인한다.
5. production release runner에서 `npx prisma migrate deploy`를 정확히 1회 실행한다.
6. 실패 시 무조건 재실행하지 않고 `_prisma_migrations`와 provider 상태를 먼저 확인한다.

완료 기준: backup evidence, restore PASS, migration status PASS, 측정 RPO/RTO 기록.

## 4-4. Durable upload 저장소 검증

현재 애플리케이션은 `STORAGE_PROVIDER=local`만 지원한다. 따라서 허용되는 초기
production 구성은 `UPLOAD_DIR`을 배포 생명주기와 분리된 durable persistent volume의
절대경로에 연결하는 방식뿐이다. Ephemeral filesystem은 NO-GO다.

1. volume mount와 접근 권한을 확인한다.
2. 테스트 첨부를 업로드하고 application restart/redeploy 뒤 다운로드한다.
3. volume snapshot/backup을 복원한 뒤 DB attachment row와 파일을 함께 smoke한다.
4. 다중 application replica를 사용할 경우 모든 replica가 동일 저장소를 보는지 확인한다.

완료 기준: restart/redeploy/restore 3개 시나리오에서 첨부 조회 PASS.

## 4-5. Blog AI provider 및 cron scheduler

1. 승인된 provider endpoint/model/key를 secret store에 설정한다.
2. 관리자 화면에서 공개 source 1건으로 provider smoke를 1회 수행한다.
3. 생성물은 DRAFT로만 남는지, PII/URL/HTML/품질 검사가 작동하는지 확인한다.
4. scheduler가 Bearer secret으로 `POST /api/cron/blog-content`를 호출하게 구성한다.
5. 무인증 401, 정상 인증 200, 중복/재시도/일일 한도 동작을 확인한다.
6. key/secret을 회전할 수 있는 절차와 담당자를 기록한다.

완료 기준: provider smoke PASS, cron 인증 PASS, DRAFT-only/한도/재시도 evidence 확보.

## 4-6. Health/readiness 및 경보

1. load balancer liveness는 `/api/health`, readiness는 `/api/ready`로 분리한다.
2. health 연속 3회 실패, readiness 5분 실패, 5분 5xx 5% 초과를 초기 경보로 설정한다.
3. DB storage 80%와 backup 실패 경보를 추가한다.
4. 실제 alert 목적지로 test-fire하고 수신 시각/담당자/응답 절차를 기록한다.
5. 응답과 로그에 DB URL, key, token, PII가 없는지 재확인한다.

완료 기준: 실제 목적지 수신 PASS와 release SHA 연계 확인.

## 4-7. 최종 Go/No-Go

다음 중 하나라도 미완료면 NO-GO다.

- remote canonical release SHA 불일치
- preflight FAIL 존재
- backup/PITR 또는 restore rehearsal 미완료
- upload가 ephemeral이거나 restore 미검증
- migration deploy evidence 없음
- provider/cron 인증 smoke 실패
- health/readiness alert 실수신 미검증

모두 충족한 뒤 read-only 핵심 사용자 흐름을 smoke하고 정상 트래픽으로 전환한다.

## 실행에 필요한 외부 입력

- GitHub private repository push 승인
- hosting 플랫폼, production project/environment 식별자, canonical HTTPS origin
- managed PostgreSQL provider/instance와 backup/PITR 정책
- durable volume의 mount path와 backup 방식
- 승인된 Blog AI provider/model 및 secret 주입 완료 여부
- scheduler 플랫폼과 실행 주기
- alert 목적지와 담당자
