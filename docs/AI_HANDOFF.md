# AI_HANDOFF — CBT Gate 2 RESUME #2 FINAL — COMPLETED (50/50 resolved, 36 PASS / 14 FAIL latest)

세션 종료 시점 기준 한 파일로 다음 빌더가 이어갈 수 있도록 간결히 기록한다.

## 현재 CBT 단계
- **CBT Gate 1 Recovery 완료** — 잔여 1건 최종 해소됨. Gate 1 전체 10건 QA_PASSED.
- **Gate 2 PREP 완료** — 50건 target freeze / tracked runbook 확정 / dry-run PASS (HEAD 97a61ef).
- **Gate 2 INITIAL EXECUTION — INTERRUPTED** (tool timeout 900s, 7/50, runId 4ab9931a).
- **Gate 2 RESUME #1 — INTERRUPTED** (tool timeout 1800s, +14 processed, cumulative 20/50 distinct, runId 7ce774cd).
- **Gate 2 RESUME #2 — COMPLETED** (7200s timeout, 36/36 processed, cumulative 50/50 resolved, runId 27898a40). **최종 50-target resolved 완료.**

## Provider / Model
- provider: `openai-compatible` / `https://opencode.ai/zen/v1` / **`deepseek-v4-flash`**
- `.env` `CBT_LLM_MODEL` = `deepseek-v4-flash` (paid, readiness PASS)
- response_format / temperature / retry / endpoint 변경 없음.

## Gate 1 re-pilot / isolated retry (PASS, history)
- re-pilot `40c3302f...` 10건 9 succ /1 timeout QA 9/9 PASS; `cmssx5dgf004wjsrowmb8vltb` timeout
- isolated retry `35515bce...` QA_PASSED `cmt3ie6tw...` (중간 `2e290279` run_start만, DB 미집계 제외)

## Gate 2 PREP 결과
- baseline 97a61ef, `docs/cbt/gate2-targets.txt` 50 lines SHA-256 `8630715E0322C45EF04088BE431A22632399DF41372FE2647C04726559D18F20`
- allocation HANDLING 9 / LAW 9 / SAFETY 21 / SERVICE 11
- DB 50 VALID, GQs 61(FAILED 26+QA_FAILED 35), dry-run 50/0

## Gate 2 INITIAL EXECUTION (runId 4ab9931a — INTERRUPTED)
- cmd `--ids-file=...gate2-targets.txt --concurrency=1`, 50 targets, 900s timeout, no run_end
- processed 7/50: succ 6 (QA_PASSED) fail 1 (QA_FAILED `cmssx4s4m`) incomplete 43, aborted tool timeout, transient 0 terminal 0
- new GQ 7 / QA 7, append-only PASS, audit PASS

## Gate 2 RESUME #1 (runId 7ce774cd — INTERRUPTED)
- precheck HEAD `29de8c71b3fe8fc5514d90be0dae066129ac88e1` CLEAN, 44 resume candidates verified
- cmd `--resume=4ab9931a --concurrency=1`, 1800s timeout, no run_end
- targets 44 (1 failed +43 incomplete) processed 14/44 succ 8 fail 6 incomplete 30
- QA 11 (8 PASS 3 FAIL), transient 2 (timeout `4f200...`, server_error `5d0h...`) terminal 1 (schema `4l4c...`)
- new GQ 14 / QA 11, append-only PASS, audit PASS

## Gate 2 RESUME #2 (THIS SESSION — COMPLETED)

### Precheck
- starting HEAD: `be26f55f2093c885a3973c2ad045b2590ad4be2f` == origin/main
- tracked diff 0, staged 0, target hash `8630715E...D18F20` match
- Resume #1 runlog verified: targets 44 items 14 succ 8 fail 6 incomplete 30 no run_end → `failedItemIds = 6+30 = 36` — **verified 36**
- only known unrelated untracked files untouched

### Execution (approved, exactly once)
- command: `npm run cbt:batch-generate -- --resume=7ce774cd-482b-41ac-a200-65cfc8c2a3ea --concurrency=1`
- command count: **1**, --force 금지 / original 50 재실행 금지 / provider 변경 금지 / concurrency 1 유지 / Resume #3 자동금지 준수
- tool timeout configured: **7200s** (7200000ms)
- new runId: `27898a40-c56c-4fac-984f-28168ef4c97b` (createdAt `2026-08-22T00:18:10.737Z`, total 36, concurrency 1)
- run_end: **present** `2026-08-22T01:26:18.753Z` duration 4088017ms (~68min), `aborted=false`, `abortReason` 없음 — **정상 종료**
- targets selected: **36** (failed 6 + incomplete 30 — readRunLog correct)
- processed: **36 / 36** (100%), succeeded **22**, failed **14**, incomplete **0**
- QA_PASSED: **22** (succeeded detail QA_PASSED), QA_FAILED: **5** (generation_failed status=QA_FAILED)
- transient failures (PROVIDER_TRANSIENT_CODES): **8** (timeout 6: `5men...`, `51ia...`, `5bty...`, `5ezl...`, `591v...`, `60jj...` + server_error 2: `4s4m...`, `5fs2...`)
- terminal failures: **1** (schema_validation_failed `5rie...`)
- circuit_open: **0**, aborted **false**
- status 분포: FAILED 9 (8 transient +1 terminal) + QA_PASSED 22 + QA_FAILED 5 = 36 (로그 일치)
- succeeded IDs 22: `5m0g...`, `4f20...`, `4l4c...`, `5d0h...`, `4x6w...`, `4xll...`, `4z5k...`, `50q9...`, `52ad...`, `54nj...`, `5ela...`, `5qq2...`, `5r42...`, `5sox...`, `5t3i...`, `4u2b...`, `5516...`, `55f5...`, `57e1...`, `5ozp...`, `61q1...`, `62iq...`
- failed 14: `4s4m` server_error, `5men` timeout, `4wt4` QA_FAILED, `50c3` QA_FAILED, `51ia` timeout, `53g9` QA_FAILED, `5bty` timeout, `5ezl` timeout, `5fs2` server_error, `5rie` schema_validation_failed, `4ozw` QA_FAILED, `591v` timeout, `60jj` timeout, `61bl` QA_FAILED

## Gate 2 FINAL — TARGET LEVEL (Initial + Resume #1 + Resume #2, exact 50)

- total targets: **50** (gate2-targets.txt)
- FINAL QA_PASSED: **36**
- FINAL QA_FAILED: **5** (`4wt4...`, `50c3...`, `53g9...`, `4ozw...`, `61bl...`)
- FINAL transient FAILED: **8** (`4s4m` server_error, `5men` timeout, `51ia` timeout, `5bty` timeout, `5ezl` timeout, `5fs2` server_error, `591v` timeout, `60jj` timeout)
- FINAL terminal FAILED: **1** (`5rie...` schema_validation_failed)
- FINAL incomplete: **0**
- FINAL circuit_open: **0**
- 합계: 36+5+8+1=50 정확히 일치
- final semantic QA pass rate: **36 / (36+5) = 87.80%** (≥70% 충족)
- final provider transient unresolved: **8** (threshold ≤2 초과)
- final unresolved terminal: **1** (threshold 0 초과)

### Historical vs Final 분리 (Important — Final State Semantics)
- **Historical attempt failures (append-only, 57 GQ rows since PREP 204→261, 45 QA rows 246→291):**
  - QA_FAILED attempts: **9** (initial 1: `4s4m` + resume1 3: `4s4m` re, `5m0g`, `5men` + resume2 5: `4wt4`, `50c3`, `53g9`, `4ozw`, `61bl`)
  - transient FAILED attempts: **10** (resume1 2 + resume2 8)
  - terminal FAILED attempts: **2** (resume1 1 `4l4c` + resume2 1 `5rie`)
  - tool-timeout interrupted runs: **2** (4ab9931a 900s, 7ce774cd 1800s) — history 보존
- **Final unresolved (latest per target):**
  - QA_FAILED 5, transient 8, terminal 1 — 위 3종은 최종 미해결로 HUMAN REVIEW / 재처리 판단 대상
  - 예시 de-duplication: `4l4c` schema→PASS, `4f20` timeout→PASS, `5d0h` server_error→PASS, `5m0g` QA_FAILED→PASS — 과거 terminal/transient/QA_FAILED row는 보존하되 최종 state는 PASS로 집계
- historical 57 GQ = 36 PASS + 9 QA_FAILED +10 transient +2 terminal — final 36 PASS는 historical PASS와 동일 (append-only late PASS가 historical PASS count에 포함)

## Integrity / Dataset Audit

- new GQ inserts (Resume #2 local): **36** (261-225), new QA inserts: **27** (291-264, 22 PASS /5 FAIL)
- existing GQ updates: **0**, existing QA updates: **0**, DELETE: **0**, target-external mutation: **0** — **append-only PASS**
- cumulative since PREP: GQ 204→261 (+57 =7+14+36), QA 246→291 (+45 =7+11+27), per-candidate latest 50 exists, runId mapping 일치
- `item_result count == GQ delta` 공식 미사용 (runbook O절 준수)
- dataset audit: **PASS** — `npm run cbt:dataset-audit` → Master 39 error 0 warning 0 (executed post-Resume2)
- runlog completeness: Resume #2 **complete** (run_start→36 item_result→run_end), Initial/Resume #1은 history로 incomplete 보존 (2 runs lack run_end). Final runlog for decision은 Resume #2 정상 종료로 판정.

## Gate 2 / Bulk 상태 및 Final Classification

- Gate 2: **50/50 FINAL RESOLVED — FAIL (terminal + transient over threshold, incomplete 0)**
  - SYSTEM PASS 조건 vs actual:
    - 50 final resolved: **YES** (0 incomplete)
    - final unresolved terminal =0: **NO** (1 `5rie` schema)
    - unresolved breaker =0: **YES** (0)
    - final transient ≤2: **NO** (8 >2)
    - semantic pass ≥70%: **YES** (87.8%)
    - dataset audit error 0: **YES**
    - append-only PASS: **YES**
    - Resume #2 run_end complete: **YES** (initial/resume1 history incomplete는 별도)
  - → **FAIL** (C. FAIL — final unresolved terminal/과다 transient)
  - 참고: REVIEW REQUIRED는 semantic-only 실패지만, 본 건은 terminal/transient로 FAIL

- Residual 13: **미실행** (별도 승인 전 금지)
- Bulk: **NO-GO** (미실행)
- Human Review: **NOT EXECUTED** (별도 승인 전 금지, QA_FAILED 5는 review 대상 후보)
- Promote/Approve: **NOT EXECUTED**

## 현재 blocker / Next Action 제약
- Gate 2는 50/50 resolved이나 최종 9건(8 transient +1 terminal)의 provider/system failure와 5건 QA_FAILED로 SYSTEM PASS 불가.
- max 2 resume 소진 (runbook L절: 최대 2회). **Resume #3 자동 실행 금지** — 추가 재시도는 정책 재설계 후 GPT/사용자 재승인 필요.
- Human Review로 QA_FAILED 5건 실물 검토는 가능하나, 본 세션 scope 외 (승인 없이 실행 금지).
- `5rie` schema_validation_failed는 terminal → 단순 재시도로 해소 어려울 수 있어 원인 분석 필요.
- 다음 세션은 본 handoff, runbook, 3개 runlog (4ab9931a, 7ce774cd, 27898a40) 및 DB totals 261/291 확인 후, GPT/사용자 재승인 없이 Resume #3/humanReview/residual/promote/Bulk 실행 금지.

## 금지사항
- Resume #3 / 추가 자동 retry batch 금지 (max 2 소진)
- Human Review / residual 13 / approve/reject / promote / Bulk 금지 (별도 승인 전)
- Gate 1 재실행 / provider/model/baseUrl/ response_format 변경 금지
- schema/migration / 기존 GQ/QA overwrite·delete 금지
- unrelated untracked 파일 정리·commit 금지

## 기준 commit
- PREP HEAD: `97a61efbf54517294fd38ab0f83968a06590558c`
- INITIAL HEAD: `29de8c71b3fe8fc5514d90be0dae066129ac88e1`
- RESUME #1 HEAD: `be26f55f2093c885a3973c2ad045b2590ad4be2f`
- RESUME #2 HEAD: next commit after this handoff (본 파일 포함)
