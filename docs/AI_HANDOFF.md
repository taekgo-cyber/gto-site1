# AI_HANDOFF — CBT Gate 2 PREP — FINAL

세션 종료 시점 기준 한 파일로 다음 빌더가 이어갈 수 있도록 간결히 기록한다.

## 현재 CBT 단계
- **CBT Gate 1 Recovery 완료** — 잔여 1건 최종 해소됨.
- Gate 1 re-pilot + 최종 isolated retry 모두 완료. Gate 1 전체 10건 QA_PASSED 상태로 회복됨.
- **Gate 2 PREP 완료** — 50건 target freeze / tracked runbook 확정 / dry-run PASS.
- Gate 2 execution / residual / Bulk / Ingest / Review / Approve / Promote 는 이번 세션에서 실행하지 않음 (NO-GO 유지).

## Provider / Model
- provider: `openai-compatible`
- baseUrl: `https://opencode.ai/zen/v1`
- model: **`deepseek-v4-flash`** (`.env` `CBT_LLM_MODEL`에서 `deepseek-v4-flash-free` → `deepseek-v4-flash` 변경, `.env` gitignore)
- 이전 400 원인 `Model is unavailable` → paid 모델 교체 후 readiness PASS (run 35515bce)
- response_format / temperature / retry policy / endpoint / provider 구현 변경 없음.
- PREP 단계에서는 `cbt:provider-probe -- --run` live probe를 수행하지 않음.

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

## Gate 2 PREP 결과 (THIS SESSION)

### Execution baseline
- starting HEAD: `5b2f6514c7596d1c49708d4592a67d9671a4832d` (main == origin/main)
- execution baseline HEAD: PREP commit 이후의 새 HEAD (push 후 확정)
- Gate 2 / Bulk / Residual / provider live probe / generation / review / promote : **미실행**

### Target 50 freeze
- tracked file: `docs/cbt/gate2-targets.txt` (50 lines, UTF-8, LF, trailing LF 1)
- category allocation: HANDLING 9 / LAW 9 / SAFETY 21 / SERVICE 11
- SHA-256: `8630715E0322C45EF04088BE431A22632399DF41372FE2647C04726559D18F20`
- exact 50 UUID: runbook 참조 (`docs/cbt/gate2-runbook.md` D절)
- DB read-only validation: 50 found / VALID 50 / REJECTED 0 / GQs 61(FAILED 26 + QA_FAILED 35) — retryable
- dry-run: `npm run cbt:batch-generate -- --ids-file=./docs/cbt/gate2-targets.txt --dry-run` → 대상 50, 스킵 0, 카테고리 분포 일치, nominal LLM calls 100

### Runbook
- path: `docs/cbt/gate2-runbook.md`
- 포함: A~X (definition, 50+13 rationale, target path/hash, PREP baseline, prerequisites, concurrency=1, resume, STOP hierarchy, logical quarantine, runlog/DB integrity per-target mapping, SYSTEM PASS ≥70%, human review visibility, residual 13, promote timing 등)

### DB baseline (PREP 시점)
- CandidateQuestion: **160**
- GeneratedQuestion: **204** (APPROVED 39 / FAILED 53 / QA_FAILED 44 / QA_PASSED 68)
- GeneratedQuestionQA: **246**
- MasterQuestion: **39**
- general eligible: **63** (Gate 2 50 + residual 13)

### Human review visibility
- 기존 Gate 2 전용 markdown export 없음.
- 기존 report: `tools/cbt/cli-reqa.ts --report`(REQA 38건 전용), `cbt:dataset-audit`.
- Gate 2 QA_PASSED 전수 human review는 DB read-only query로 human-readable 자료 생성 필요 — runbook Q절에 예시 기록. 별도 UI/export 구현 없음.

### Abort/circuit integrity finding (code/tests)
- `circuit_open` item은 `item_result`만 존재, GQ row 생성 없음(`generate.ts` line 279-287).
- 따라서 `item_result count == GQ delta` 공식은 사용 금지. target_id별 mapping 검증 필요 — runbook O절에 절차 기록.

## 현재 DB 핵심 totals
- CandidateQuestion: **160**
- GeneratedQuestion: **204**
- GeneratedQuestionQA: **246**
- MasterQuestion: **39**

## append-only / preservation 상태
- 재생성은 신규 UUID 행 append, 기존 overwrite/delete 금지(No Drop) — 전 과정 준수.
- 기존 FAILED 10건(rate_limited) 보존, re-pilot timeout 보존, retry server_error 보존, 모두 이번 최종 성공과 함께 유지.

## 테스트/검증 결과
- recovery Build: targeted 48/48, full CBT 535/535, typecheck/build/probe dry-run PASS (이전 세션)
- PREP validation: candidate 50 eligibility / dry-run 50 / lint/typecheck/build PASS (this session, see below)
- 최종 retry: generation+QA PASS, runlog 완결, DB totals 정합

## Gate 2 / Bulk 상태
- Gate 2: **PREP COMPLETE** (execution 미실행)
- Residual: **미실행**
- Bulk: **NO-GO** (미실행)

## 현재 blocker
- **없음** — Gate 2 PREP이 완료되었으나 execution은 별도 승인 대기.
- `cmssx5dgf004wjsrowmb8vltb`는 과거 timeout→500 이력 보유 — provider transient 재발 시 모델 가용성 점검 필요성만 참고.
- Human review용 기존 Gate 2 전용 export 없음 — DB query로 대체 (BLOCKER 아님).

## 다음 세션 Next Action
- 본 handoff와 `docs/cbt/gate2-runbook.md`, `docs/cbt/gate2-targets.txt`(hash 일치)를 확인.
- execution prerequisites(git clean, hash match, DB eligibility, dry-run, config dry-run) 검증.
- 별도 승인 후 `npm run cbt:provider-probe -- --run` 1회 수행 → PASS 시에만 Gate 2 execution:
  `npm run cbt:batch-generate -- --ids-file=./docs/cbt/gate2-targets.txt --concurrency=1`
- 추가 provider 호출은 승인 전까지 불필요.

## 금지사항
- Gate 1 전체 재실행 / 추가 retry / 다른 candidate 생성 금지 (완료 상태)
- Gate 2 / residual / Bulk / 신규 ingest / review / promote 금지 (별도 승인 전)
- provider/model/baseUrl 변경 · `deepseek-v4-flash-free` 복귀 금지
- `response_format` 변경 · 불필요한 application code 수정 금지
- schema/migration 금지
- 기존 FAILED/기존 GQ/QA overwrite·delete 금지
- 관련 없는 untracked 파일 정리·commit 금지
- PREP에서 live provider probe(`--run`) 수행 금지 — execution 단계에서 별도 승인 후 1회만 수행

## 기준 commit
- 이전 base HEAD: `c6692ec6c04c9d05df756dc2ea2f2122bd945649`
- 회복 빌드 반영 HEAD: `4ddedf0fa93be3b56639a03ca1d5519a8b76e5e3`
- Gate 1 Recovery 완료 HEAD: `5b2f6514c7596d1c49708d4592a67d9671a4832d` (PREP starting HEAD)
- Gate 2 PREP HEAD: PREP commit 이후 새 HEAD (push 후 확정, 본 파일은 해당 commit에 포함)
