# Production Environment Readiness

Track B production 환경변수 운영 계약이다. 실제 secret 값은 이 문서나 Git에 기록하지 않는다.

## Git / secret handling

- `.env` 및 `.env.*`는 `.gitignore` 대상이다.
- `.env.example`만 예외적으로 추적 가능하지만 실제 비밀값을 넣지 않는다.
- secret은 배포 플랫폼의 암호화된 환경변수/secret store에서 주입한다.
- `NEXT_PUBLIC_*` 값은 브라우저 번들에 포함될 수 있으므로 비밀값을 넣지 않는다.
- secret 회전 시 기존 값을 Git history, 이슈, 로그에 남기지 않는다.

## Production runtime variables

| 변수 | 구분 | Production 계약 |
| --- | --- | --- |
| `DATABASE_URL` | 필수 secret | PostgreSQL production 연결 문자열. Build/Prisma migration/runtime이 올바른 production DB를 가리키는지 배포 전 검증한다. |
| `AUTH_SECRET` | 필수 secret | 32자 이상의 강한 랜덤 값. 세션 HMAC 서명용이며 외부 노출 금지. 교체 시 기존 세션이 무효화될 수 있음을 운영 절차에 반영한다. |
| `NEXT_PUBLIC_SITE_URL` | 필수 public config | production canonical origin(HTTPS). sitemap/robots 기준 URL로 사용된다. build 시점 값을 확인한다. |
| `SITE_AVAILABILITY` | 필수 launch config | `PUBLIC` 또는 `MAINTENANCE`. Production에서 누락/오류이면 Proxy가 공개 경로를 maintenance로 fail-closed 처리한다. health/readiness와 관리자 운영 경로는 유지한다. |
| `LAUNCH_FREE_AT` | 필수 launch config | `2026-10-01T00:00:00+09:00` 형식의 FREE LAUNCH 경계. Production은 명시값이 필요하다. |
| `LAUNCH_PAID_PRENOTICE_AT` | 필수 launch config | `+09:00` 명시 KST 경계. FREE 경계보다 뒤여야 한다. |
| `LAUNCH_DISCOUNTED_PAID_AT` | 필수 launch config | `+09:00` 명시 KST 경계. 할인 숫자를 정의하지 않고 activation 상태만 결정한다. |
| `LAUNCH_STANDARD_PAID_AT` | 필수 launch config | `+09:00` 명시 KST 경계. 앞선 모든 경계보다 뒤여야 한다. |
| `MONETIZATION_ACTIVATION_MODE` | 필수 safety config | 현재 허용값은 `FREE_ONLY`. 실제 PG/승인된 할인 정책 없이 live charge를 활성화하지 않는다. |
| `LEAD_MAX_CONTACT_UNLOCKS_PER_LEAD` | 필수 policy config | 0 이상의 정수. 미설정/비정상 값이면 Lead 정책 해석이 fail-closed 된다. 운영 정책 승인값을 사용한다. |
| `STORAGE_PROVIDER` | 현재 제한 | 현재 구현은 `local`만 지원한다. production에서 로컬 ephemeral disk를 영구 저장소로 간주하면 안 된다. durable storage 전환 전까지 출시 blocker로 관리한다. |
| `UPLOAD_DIR` | local 사용 시 필수 운영 config | `STORAGE_PROVIDER=local`일 때 쓰기 가능한 persistent volume 경로를 명시한다. 기본 `./uploads`에 의존하지 않는다. |
| `BLOG_AI_BASE_URL` | AI provider config | 승인된 OpenAI-compatible HTTPS endpoint. credential을 URL에 포함하지 않는다. |
| `BLOG_AI_API_KEY` | AI 기능 사용 시 필수 secret | 관리자 AI 초안 생성과 automation runner가 사용하는 provider key. 로그·브라우저·Git에 노출하지 않는다. |
| `BLOG_AI_MODEL` | AI provider config | 운영 승인된 model identifier. provider smoke evidence에 값 자체가 아닌 승인된 구성 여부를 기록한다. |
| `BLOG_AUTOMATION_CRON_SECRET` | scheduler 연결 시 필수 secret | 32자 이상의 강한 Bearer secret. scheduler secret store에서 주입하고 health/log/evidence에 값을 남기지 않는다. |
| `NODE_ENV` | 플랫폼 관리 | production runtime에서 `production`; secure cookie 등 framework/runtime 동작에 사용된다. 수동 임의 변경 금지. |

## Offline CBT tool variables

다음은 웹 runtime 필수값이 아니라 CBT 오프라인/운영 도구 실행 시 필요한 별도 계약이다. Track A/AI 기능 코드 자체는 Track B에서 수정하지 않는다.

- `CBT_DATA_DIR`
- `CBT_LLM_PROVIDER`
- `CBT_LLM_BASE_URL`
- `CBT_LLM_API_KEY` (secret)
- `CBT_LLM_MODEL`
- `CBT_TEST_SOURCE_ID` (테스트/도구용)

웹 production 배포 환경에 불필요한 LLM secret을 넣지 않는 것을 기본으로 한다.

## Pre-deploy check

1. 배포 대상 환경이 production인지 확인한다.
2. `DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_SITE_URL`, `LEAD_MAX_CONTACT_UNLOCKS_PER_LEAD` 존재 여부만 확인하고 값을 로그로 출력하지 않는다.
3. `NEXT_PUBLIC_SITE_URL`이 실제 HTTPS canonical origin과 일치하는지 확인한다.
4. storage가 재시작/재배포 후에도 보존되는지 확인한다. 현재 local-only 구현을 ephemeral filesystem에 배포하지 않는다.
5. migration은 application startup의 임의 schema mutation이 아니라 별도 release step에서 `prisma migrate deploy`로 수행한다.
6. `/api/health`가 secret/DB 상세를 노출하지 않고 liveness 200을 반환하는지 확인한다.
7. deploy 완료 후 secret 값을 로그/스크린샷/evidence에 남기지 않는다.
8. Blog automation을 활성화할 때만 승인된 scheduler가 `/api/cron/blog-content`를 Bearer secret으로 호출하도록 연결하고, 무자격 요청이 401로 fail-closed 되는지 확인한다.

## Rotation / incident rule

- `AUTH_SECRET` 또는 DB credential 노출 의심 시 즉시 새 값으로 회전하고 영향 범위를 점검한다.
- `AUTH_SECRET` 회전은 사용자 세션 재로그인을 유발할 수 있다.
- DB credential 회전은 새 credential 연결 검증 후 이전 credential을 폐기한다.
- 환경변수 이름과 존재 여부만 운영 evidence로 남기고 값은 저장하지 않는다.
