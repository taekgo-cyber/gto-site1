# AI_HANDOFF — CBT Gate 1 Recovery

세션 종료 시점 기준 한 파일로 다음 빌더가 이어갈 수 있도록 간결히 기록한다.

## 현재 CBT 단계
- **CBT Gate 1 Recovery** (제지 IPO 지입몰 문제은행 파이프라인)
- Gate 1 re-pilot 실행 완료, 일부 recovery 항목 미완료 상태로 세션 종료 진행.
- Gate 2 / Bulk / Ingest / Review / Approve / Promote 는 이 세션에서 실행하지 않음 (NO-GO 유지).

## Provider / Model
- provider(코드 wrapper): `openai-compatible`
- baseUrl: `https://opencode.ai/zen/v1`
- model: **`deepseek-v4-flash`** (`.env` `CBT_LLM_MODEL`에서 `deepseek-v4-flash-free` → `deepseek-v4-flash`로 변경됨. `.env`는 gitignore).
- 이전 400 원인: `deepseek-v4-flash-free`가 `Model is unavailable`(safe detail 확인) → paid 모델로 교체 후 readiness PASS.
- response_format / temperature / retry policy / endpoint / provider 구현 변경 없음.

## Gate 1 re-pilot 결과 (PASS)
- runId: `40c3302f-c7eb-4874-935c-6c04f775623c` (`--force --concurrency=1`, exact 10 candidate)
- target: 10 / generation success: **9** / generation failed: **1** / QA: **9/9 PASS**
- re-pilot 실패 건(첫 실패 = timeout):
  - UUID: `cmssx5dgf004wjsrowmb8vltb`
  - Candidate: 92599 / CAT-LAW
  - errorCode(첫): `timeout`

## Unresolved recovery item (1건)
- 정확한 UUID: `cmssx5dgf004wjsrowmb8vltb`
- Candidate: `92599` / Category: `CAT-LAW`
- 이 항목만 최종 미생성.

## 이번 single subset retry 결과 (FAIL / transient provider 500)
- runId: `5e144ea7-7e14-49cb-b281-d73d6d890454` (`--ids=cmssx5dgf004wjsrowmb8vltb --force --concurrency=1`, execution count=1)
- generation: FAIL
- errorCode: `server_error` / HTTP status: **500** (Error: `API 응답 500 Internal Server Error`)
- QA: not executed (generation 실패로 QA 미도달)
- 신규 GQ **1건 FAILED/server_error append-only INSERT**
- 기존 timeout record 보존 / 기존 FAILED 10 보존 / 기존 GQ·QA UPDATE 0 / DELETE 0 / 대상 외 변경 0
- runbook STOP 조건(provider 5xx)에 따라 두 번째 retry 없이 종료.

## 현재 DB 핵심 totals
- CandidateQuestion: **160**
- GeneratedQuestion: **203**
- GeneratedQuestionQA: **245**
- MasterQuestion: **39**
- (변경은 신규 GQ 1건 append 반영, 기존 데이터 불변)

## append-only / preservation 상태
- 재생성은 신규 UUID 행 append, 기존 행 overwrite/delete 금지(No Drop).
- 기존 FAILED 10건(rate_limited, cmt1g*) 그대로 보존.
- re-pilot timeout record(cm_t34b2tk__/FAILED/timeout) 보존.
- 금번 retry server_error FAILED(cm_t3hrvsx) 보존.

## 테스트/검증 결과 (이 세션 Build 검증 기준)
- targeted tests: 48/48 PASS
- full CBT suite: 535/535 PASS
- typecheck: PASS / build: PASS / probe dry-run: PASS
- repo 전체 lint: 2 errors는 이 Build와 무관한 기존 untracked `check-env-pattern.js`, `check-env.js`(구현 산출물) 때문이며 이 세션에서 미변경.

## Gate 2 / Bulk 상태
- Gate 2: **NO-GO** (미실행)
- Bulk: **NO-GO** (미실행)

## 현재 blocker
- `cmssx5dgf004wjsrowmb8vltb`(92599/CAT-LAW)가 re-pilot `timeout` → retry `HTTP 500 server_error`로 연속 transient 실패 상태로 미생성.
- 이 항목 추가 provider 호출은 별도 GPT/사용자 승인 전 **금지**.

## 다음 세션 Next Action
> `cmssx5dgf004wjsrowmb8vltb`에 대한 추가 provider 호출은 별도 GPT/사용자 승인 전 금지.
> 다음 세션에서 handoff를 읽은 뒤, 기존 `timeout` + `HTTP 500` 연속 transient 실패를 기준으로
> read-only 상태 점검 또는 추가 1회 retry 여부를 결정한다.

- (승인 시) read-only 점검: provider readiness probe(`npm run cbt:provider-probe -- --dry-run`), 해당 candidate 신규 GQ/QA 상태 재확인.
- (별도 1회 승인 시) subset retry: `npm run cbt:batch-generate -- --ids=cmssx5dgf004wjsrowmb8vltb --force --concurrency=1`.
- POTENTIAL: `HTTP 500` 반복 시 모델/엔드포인트 가용성·quota 상태 점검 필요(코드 수정 아님).

## 금지사항
- Gate 1 전체 재실행 / 다른 candidate retry / 두 번째 자동 retry 금지.
- Gate 2 / Bulk / 신규 ingest 금지.
- provider/model/baseUrl 변경 · `deepseek-v4-flash-free` 복귀 금지.
- `response_format` 변경 · 불필요한 application code 수정 금지.
- schema/migration 금지.
- 기존 FAILED/기존 GQ/QA overwrite·delete 금지.
- 관련 없는 untracked 파일 정리·commit 금지(사용자 보호 7개, 타 세션 artifact `cbt-400-analysis.txt`, `check-env*.js` 등).

## 기준 commit
- 현재(세션 시작) base HEAD: `c6692ec6c04c9d05df756dc2ea2f2122bd945649` (branch `main` / `origin/main`)
- 이 세션 빌드 변경: recovery Build(Retry-After + provider probe + safe 400 detail)에 해당하는 tracked 8개 + 신규 probe CLI 2개.
