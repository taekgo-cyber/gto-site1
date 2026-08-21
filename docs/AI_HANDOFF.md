# AI_HANDOFF — CBT Gate 2 INITIAL EXECUTION — INTERRUPTED

세션 종료 시점 기준 한 파일로 다음 빌더가 이어갈 수 있도록 간결히 기록한다.

## 현재 CBT 단계
- **CBT Gate 1 Recovery 완료** — 잔여 1건 최종 해소됨.
- Gate 1 re-pilot + 최종 isolated retry 모두 완료. Gate 1 전체 10건 QA_PASSED 상태로 회복됨.
- **Gate 2 PREP 완료** — 50건 target freeze / tracked runbook 확정 / dry-run PASS (HEAD 97a61ef).
- **Gate 2 INITIAL EXECUTION — INTERRUPTED (tool timeout, 7/50 processed).**

## Provider / Model
- provider: `openai-compatible`
- baseUrl: `https://opencode.ai/zen/v1`
- model: **`deepseek-v4-flash`** (`.env` `CBT_LLM_MODEL`에서 `deepseek-v4-flash-free` → `deepseek-v4-flash` 변경, `.env` gitignore)
- 이전 400 원인 `Model is unavailable` → paid 모델 교체 후 readiness PASS (run 35515bce)
- response_format / temperature / retry policy / endpoint / provider 구현 변경 없음.
- 이번 세션 live readiness probe 1회 PASS (deepseek-v4-flash, provider-probe --run).

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

## Gate 2 PREP 결과
- baseline HEAD: `97a61efbf54517294fd38ab0f83968a06590558c` (main == origin/main)
- tracked file: `docs/cbt/gate2-targets.txt` (50 lines, SHA-256 `8630715E0322C45EF04088BE431A22632399DF41372FE2647C04726559D18F20`)
- category allocation: HANDLING 9 / LAW 9 / SAFETY 21 / SERVICE 11
- DB validation: 50 found / VALID 50 / REJECTED 0 / GQs 61(FAILED 26 + QA_FAILED 35)
- dry-run: 대상 50, 스킵 0, 카테고리 일치, nominal 100
- runbook: `docs/cbt/gate2-runbook.md`

## Gate 2 INITIAL EXECUTION 결과 (THIS SESSION — INTERRUPTED)

### Baseline precheck
- tracked diff: CLEAN
- staged: CLEAN
- HEAD == origin/main == `97a61efbf54517294fd38ab0f83968a06590558c`
- target hash: `8630715E0322C45EF04088BE431A22632399DF41372FE2647C04726559D18F20` — match
- only known unrelated untracked files

### DB / target dry-run
- `npm run cbt:batch-generate -- --ids-file=./docs/cbt/gate2-targets.txt --dry-run` → 대상 50, 스킵 0, 카테고리 일치

### Provider config dry-run
- `npm run cbt:provider-probe -- --dry-run` → `openai-compatible / deepseek-v4-flash` PASS

### Live readiness (approved, exactly once)
- command: `npm run cbt:provider-probe -- --run`
- execution count: 1
- provider: `openai-compatible`, model: `deepseek-v4-flash`
- HTTP attempts: 1
- result: **PASS** — `readiness ok`
- exit: 0

### Gate 2 initial run (approved, exactly once — interrupted by tool timeout)
- command: `npm run cbt:batch-generate -- --ids-file=./docs/cbt/gate2-targets.txt --concurrency=1`
- command execution count: 1
- runId: `4ab9931a-9e04-4839-81cb-8767561373a2` (total 50, concurrency 1)
- startedAt: `2026-08-21T23:12:00.157Z` (UTC)
- interrupted at: tool timeout 900s (15min), shell terminated. Process killed, **no run_end**.
- processed: **7 / 50**
- succeeded: **6** (`succeeded` in runlog)
- failed: **1** (QA_FAILED semantic)
- incomplete: **43** (`run_start.targets` 중 `item_result` 없음)
- aborted: **true** (incomplete due to interruption, no circuit_open/log_failure)
- abortReason: incomplete / tool timeout (not code-enforced circuit_open/log_failure)
- provider final transient failures: **0** (all 7 processed had errorCode null)
- terminal failures: **0**
- QA attempted: 7 (generation 성공 7 → QA 7)
- QA_PASSED: **6**
- QA_FAILED: **1** (`cmssx4s4m001wjsrojuubfwm8` — semantic, criticalFlaws)
- semantic QA pass rate: **85.7%** (6/7) — threshold 70% 충족 (부분 표본)
- circuit_open items: 0
- incomplete items: 43 (runlog에 없음)

### Failed / incomplete IDs
- failed (QA_FAILED): `cmssx4s4m001wjsrojuubfwm8`
- incomplete 43: `cmssx532d003gjsroyu02pm16` 이후 43건 (runlog targets 중 processed 7 제외 나머지, dry-run 목록에서 `cmssx532d...` 제외? 실제 incomplete는 cmssx532d는 succeeded였으므로 제외. incomplete는 `cmssx532d` 다음부터 `cmssx5l7w...` 등? 정확히는 runlog targets 50 중 first 7을 제외한 43건. full list는 `docs/cbt/gate2-targets.txt`에서 첫 7개 제외.)
- resume candidates: 44 (failed 1 + incomplete 43)

### DB / runlog integrity
- new GQ inserts: **7** (cmt3kf7m5..., cmt3kgmr9..., cmt3klnwr..., cmt3kooem..., cmt3kp896..., cmt3krtb1..., cmt3kttw6...)
- new QA inserts: **7** (step8-auto-qa-v3.1, isPass 6t/1f)
- existing GQ updates: 0
- existing QA updates: 0
- DELETE: 0
- target-external DB changes: 0
- runlog complete: **NO** (`run_end` 없음, 43 incomplete)
- per-target mapping: 7 targets → GQ+QA 존재, status/errorCode 일치 (`circuit_open`는 GQ 없이 item_result만 — 이번 run에서 0건이므로 `item_result count (7) == GQ delta (7)`이 성립하나 aborted run에서는 일반적으로 성립하지 않음 — runbook O절 절차 적용)
- append-only integrity: PASS

### Dataset audit
- `npm run cbt:dataset-audit` → Master 39, error 0, warning 0 — PASS

## 현재 DB 핵심 totals
- CandidateQuestion: **160** (변동 없음)
- GeneratedQuestion: **211** (이전 204 + 7) — APPROVED 39 / FAILED 53 / QA_FAILED 45 (+1) / QA_PASSED 74 (+6)
- GeneratedQuestionQA: **253** (이전 246 + 7)
- MasterQuestion: **39** (변동 없음)

## append-only / preservation 상태
- 재생성은 신규 UUID 행 append, 기존 overwrite/delete 금지(No Drop) — 전 과정 준수.
- 이번 7건 모두 신규 row. 기존 row 변경 없음.

## 테스트/검증 결과
- recovery Build: targeted 48/48, full CBT 535/535, typecheck/build/probe dry-run PASS (이전 세션)
- PREP validation: dry-run 50 / lint(check-env baseline 2 errors)/typecheck PASS/build PASS (PREP)
- INITIAL EXECUTION: readiness PASS, 7/50 processed, semantic pass 85.7%, dataset-audit PASS, append-only PASS, runlog incomplete due to tool timeout

## Gate 2 / Bulk 상태
- Gate 2: **INITIAL EXECUTION INTERRUPTED** (7/50, runId `4ab9931a-9e04-4839-81cb-8767561373a2`, resume pending)
- Residual: **미실행**
- Bulk: **NO-GO** (미실행)

## 현재 blocker
- Gate 2 run `4ab9931a-9e04-4839-81cb-8767561373a2`가 tool timeout으로 중단됨 (incomplete 43). code-enforced circuit_open/log_failure 아님.
- Tool timeout 900s가 Gate 2 50건 concurrency=1 처리에 부족. 다음 실행은 더 긴 timeout으로 진행 필요.
- Human review용 기존 Gate 2 전용 export 없음 — DB query로 대체 (BLOCKER 아님).

## 다음 세션 Next Action
- 본 handoff와 `docs/cbt/gate2-runbook.md`, `docs/cbt/gate2-targets.txt`(hash 일치), `data/cbt/runs/4ab9931a-9e04-4839-81cb-8767561373a2.jsonl` 확인.
- DB totals 211/253과 runlog 상태(incomplete) 확인.
- GPT/사용자 승인 후 **resume**으로 남은 44건 처리:
  `npm run cbt:batch-generate -- --resume=4ab9931a-9e04-4839-81cb-8767561373a2 --concurrency=1`
  (max 2 resume 중 1차. timeout은 1800s 이상 권장)
- resume 금지 없이 자동 진행 금지. Human Review / residual / promote / Bulk 모두 별도 승인 필요.

## 금지사항
- Gate 1 전체 재실행 / 추가 retry / 다른 candidate 생성 금지 (완료 상태)
- Gate 2 잔여 44건 resume / Human Review / residual / Bulk / 신규 ingest 금지 (별도 승인 전)
- provider/model/baseUrl 변경 · `deepseek-v4-flash-free` 복귀 금지
- `response_format` 변경 · 불필요한 application code 수정 금지
- schema/migration 금지
- 기존 FAILED/기존 GQ/QA overwrite·delete 금지
- 관련 없는 untracked 파일 정리·commit 금지

## 기준 commit
- 이전 base HEAD: `c6692ec6c04c9d05df756dc2ea2f2122bd945649`
- 회복 빌드 반영 HEAD: `4ddedf0fa93be3b56639a03ca1d5519a8b76e5e3`
- Gate 1 Recovery 완료 HEAD: `5b2f6514c7596d1c49708d4592a67d9671a4832d`
- Gate 2 PREP HEAD: `97a61efbf54517294fd38ab0f83968a06590558c`
- Gate 2 INITIAL EXECUTION HEAD: next commit after this handoff (본 파일 포함)
