# AI_HANDOFF — CBT Gate 1 Recovery — FINAL

세션 종료 시점 기준 한 파일로 다음 빌더가 이어갈 수 있도록 간결히 기록한다.

## 현재 CBT 단계
- **CBT Gate 1 Recovery 완료** — 잔여 1건 최종 해소됨.
- Gate 1 re-pilot + 최종 isolated retry 모두 완료. Gate 1 전체 10건 QA_PASSED 상태로 회복됨.
- Gate 2 / Bulk / Ingest / Review / Approve / Promote 는 이번 세션에서 실행하지 않음 (NO-GO 유지).

## Provider / Model
- provider: `openai-compatible`
- baseUrl: `https://opencode.ai/zen/v1`
- model: **`deepseek-v4-flash`** (`.env` `CBT_LLM_MODEL`에서 `deepseek-v4-flash-free` → `deepseek-v4-flash` 변경, `.env` gitignore)
- 이전 400 원인 `Model is unavailable` → paid 모델 교체 후 readiness PASS (run 35515bce)
- response_format / temperature / retry policy / endpoint / provider 구현 변경 없음.

## Gate 1 re-pilot 결과 (PASS)
- runId: `40c3302f-c7eb-4874-935c-6c04f775623c` (`--force --concurrency=1`, exact 10)
- target 10 / generation 9 success / 1 timeout / QA 9/9 PASS
- 첫 실패: `cmssx5dgf004wjsrowmb8vltb` (92599 / CAT-LAW) timeout

## 최종 isolated retry 결과 (PASS)
- 승인 대상: `cmssx5dgf004wjsrowmb8vltb` (92599 / CAT-LAW) — 단독 1건, `--force --concurrency=1`, execution count 1
- 이전 시도 이력: re-pilot timeout(`cmt34b2tk`) → subset retry1 server_error 500(`cmt3hrvsx`) — 모두 transient, append-only 보존
- 금번 최종 retry runId: `35515bce-99fc-433a-a7ef-078d086cfe0f` (중간 도구 타임아웃으로 생성된 미완료 run `2e290279-16fe-418d-9f00-43b510c3ac82`는 run_start만 있고 DB write 없음 — 툴링 중단으로 미집계, 실제 카운트에서 제외)
- 결과: **QA_PASSED** — 신규 GQ `cmt3ie6tw0000ekrodzit21t3` (promptVersion `step8-question-gen-v1` / QA `step8-auto-qa-v3.1` isPass t), 80979ms
- 신규 GQ 1건 / 신규 QA 1건 append-only INSERT, 기존 timeout/server_error FAILED 2건 및 기존 FAILED 10건 모두 보존, UPDATE 0, DELETE 0, 대상 외 변경 0, runlog 완결

## 현재 DB 핵심 totals
- CandidateQuestion: **160**
- GeneratedQuestion: **204** (re-pilot 후 203 → 최종 retry 후 +1)
- GeneratedQuestionQA: **246** (re-pilot 후 245 → 최종 retry 후 +1)
- MasterQuestion: **39**

## append-only / preservation 상태
- 재생성은 신규 UUID 행 append, 기존 overwrite/delete 금지(No Drop) — 전 과정 준수.
- 기존 FAILED 10건(rate_limited) 보존, re-pilot timeout 보존, retry server_error 보존, 모두 이번 최종 성공과 함께 유지.

## 테스트/검증 결과
- recovery Build: targeted 48/48, full CBT 535/535, typecheck/build/probe dry-run PASS
- 최종 retry: generation+QA PASS, runlog 완결, DB totals 정합

## Gate 2 / Bulk 상태
- Gate 2: **NO-GO** (미실행)
- Bulk: **NO-GO** (미실행)

## 현재 blocker
- **없음** — Gate 1 Recovery 잔여 1건이 최종 해소되어 Gate 1 전체 10건이 생성·QA 완료 상태. 추가 provider 호출은 불필요.
- 단, `cmssx5dgf004wjsrowmb8vltb`는 과거 timeout→500 이력 보유 — provider transient 재발 시 모델 가용성 점검 필요성만 참고.

## 다음 세션 Next Action
- Gate 1 Recovery 완료를 전제로, handoff를 읽고 Gate 2 진입 여부 또는 Human Review/promote 절차 승인 여부를 결정한다.
- 추가 provider 호출은 불필요. 필요 시 `npm run cbt:provider-probe -- --dry-run` 등 read-only 점검만 수행.
- 다음 세션은 `docs/AI_HANDOFF.md`의 runId/DB totals를 기준으로 Gate 2/Bulk 승인 전 read-only 재확인부터 시작한다.

## 금지사항
- Gate 1 전체 재실행 / 추가 retry / 다른 candidate 생성 금지 (완료 상태)
- Gate 2 / Bulk / 신규 ingest 금지 (별도 승인 전)
- provider/model/baseUrl 변경 · `deepseek-v4-flash-free` 복귀 금지
- `response_format` 변경 · 불필요한 application code 수정 금지
- schema/migration 금지
- 기존 FAILED/기존 GQ/QA overwrite·delete 금지
- 관련 없는 untracked 파일 정리·commit 금지

## 기준 commit
- 이전 base HEAD: `c6692ec6c04c9d05df756dc2ea2f2122bd945649`
- 회복 빌드 반영 HEAD: `4ddedf0fa93be3b56639a03ca1d5519a8b76e5e3` (본 핸드오프는 이 위에서 작성, 다음 commit 이후 최종 HEAD 갱신됨)
