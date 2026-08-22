# AI_HANDOFF — CBT Gate 2 RESUME #1 — INTERRUPTED (tool timeout, 21/50 processed cumulatively)

세션 종료 시점 기준 한 파일로 다음 빌더가 이어갈 수 있도록 간결히 기록한다.

## 현재 CBT 단계
- **CBT Gate 1 Recovery 완료** — 잔여 1건 최종 해소됨.
- Gate 1 re-pilot + 최종 isolated retry 모두 완료. Gate 1 전체 10건 QA_PASSED 상태로 회복됨.
- **Gate 2 PREP 완료** — 50건 target freeze / tracked runbook 확정 / dry-run PASS (HEAD 97a61ef).
- **Gate 2 INITIAL EXECUTION — INTERRUPTED (tool timeout, 7/50 processed, runId 4ab9931a).**
- **Gate 2 RESUME #1 — INTERRUPTED (tool timeout, +14 processed, cumulative 20-21/50 distinct, runId 7ce774cd).**

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

## Gate 2 PREP 결과
- baseline HEAD: `97a61efbf54517294fd38ab0f83968a06590558c` (main == origin/main)
- tracked file: `docs/cbt/gate2-targets.txt` (50 lines, SHA-256 `8630715E0322C45EF04088BE431A22632399DF41372FE2647C04726559D18F20`)
- category allocation: HANDLING 9 / LAW 9 / SAFETY 21 / SERVICE 11
- DB validation: 50 found / VALID 50 / REJECTED 0 / GQs 61(FAILED 26 + QA_FAILED 35)
- dry-run: 대상 50, 스킵 0, 카테고리 일치, nominal 100
- runbook: `docs/cbt/gate2-runbook.md`

## Gate 2 INITIAL EXECUTION 결과 (INTERRUPTED — runId 4ab9931a)

### Baseline precheck
- tracked diff: CLEAN
- staged: CLEAN
- HEAD == origin/main == `97a61efbf54517294fd38ab0f83968a06590558c`
- target hash: `8630715E0322C45EF04088BE431A22632399DF41372FE2647C04726559D18F20` — match
- only known unrelated untracked files

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

### Failed / incomplete IDs (initial)
- failed (QA_FAILED): `cmssx4s4m001wjsrojuubfwm8`
- incomplete 43: runlog targets 50 중 first 7 제외한 43건
- resume candidates: 44 (failed 1 + incomplete 43)

### DB / runlog integrity (initial)
- new GQ inserts: **7** (cmt3kf7m5..., cmt3kgmr9..., cmt3klnwr..., cmt3kooem..., cmt3kp896..., cmt3krtb1..., cmt3kttw6...)
- new QA inserts: **7** (step8-auto-qa-v3.1, isPass 6t/1f)
- existing GQ updates: 0 / DELETE 0 / target-external 0
- runlog complete: **NO** (`run_end` 없음, 43 incomplete)
- append-only integrity: PASS
- dataset-audit: PASS (Master 39, error 0)

## Gate 2 RESUME #1 결과 (THIS SESSION — INTERRUPTED)

### Baseline precheck (Resume #1)
- starting HEAD: `29de8c71b3fe8fc5514d90be0dae066129ac88e1` (== origin/main)
- tracked diff: CLEAN, staged: CLEAN
- target hash: `8630715E0322C45EF04088BE431A22632399DF41372FE2647C04726559D18F20` — match
- original runlog verified: targets 50 / processed 7 / QA_PASSED 6 / QA_FAILED 1 / incomplete 43 / resume candidates 44 — match
- only known unrelated untracked files (cbt-400-analysis.txt, check-env*.js, docs/screen-reference.html, exam.html, stage-b*.log, tools/cbt/_tmp-before2.ts) — untouched

### Resume execution (approved, exactly once)
- command: `npm run cbt:batch-generate -- --resume=4ab9931a-9e04-4839-81cb-8767561373a2 --concurrency=1`
- command execution count: **1** (this session)
- shell timeout: 1800000ms (1800s) — still interrupted by tool timeout
- new runId: `7ce774cd-482b-41ac-a200-65cfc8c2a3ea` (created, targets 44, concurrency 1, createdAt `2026-08-21T23:33:15.171Z`)
- interrupted at: tool timeout 1800s (30min), shell terminated. Process killed, **no run_end**.
- resume targets selected: **44** (failed 1 + incomplete 43 — readRunLog `failedItemIds` correct)
- processed in this run: **14 / 44**
- succeeded: **8** (QA_PASSED)
- failed: **6**
- incomplete: **30** (44 - 14)
- aborted: **true** (incomplete due to interruption, not code-enforced circuit_open/log_failure)
- abortReason: incomplete / tool timeout
- QA attempted: 11 (8 QA_PASSED + 3 QA_FAILED; 3 FAILED without QA)
- QA_PASSED: **8** (`cmssx4f8p0002jsro2p3mc4x0`, `cmssx4irv000kjsrot5wjf8dz`, `cmssx4moj0014jsrodzpmkh6t`, `cmssx4n2m0016jsrot2u3yxfd`, `cmssx5bgm004mjsrols1xc8hg`, `cmssx5hpd005ijsro16e81o9m`, `cmssx4gf40008jsrokq14xs9x`, `cmssx4uub002ajsro1cjdxrg7`)
- QA_FAILED: **3** (`cmssx4s4m001wjsrojuubfwm8` re-failed, `cmssx5m0g0064jsropgj5a38n`, `cmssx5men0066jsrovtuz3l16` — semantic criticalFlaws)
- provider transient failures (errorCode in PROVIDER_TRANSIENT_CODES): **2** (`cmssx4f200000jsrodt27wuxv` timeout, `cmssx5d0h004ujsrol1wsdodv` server_error)
- terminal failures: **1** (`cmssx4l4c000wjsroggq19468` schema_validation_failed — not transient, not counted for breaker)
- circuit_open items: **0**
- provider final transient failures total in this run: 2 / terminal: 1

### Failed / incomplete IDs (Resume #1 run)
- failed 6:
  - `cmssx4s4m001wjsrojuubfwm8` — generation_failed: status=QA_FAILED
  - `cmssx5m0g0064jsropgj5a38n` — generation_failed: status=QA_FAILED
  - `cmssx5men0066jsrovtuz3l16` — generation_failed: status=QA_FAILED
  - `cmssx4f200000jsrodt27wuxv` — timeout
  - `cmssx4l4c000wjsroggq19468` — schema_validation_failed
  - `cmssx5d0h004ujsrol1wsdodv` — server_error
- incomplete 30:
  - `cmssx4wt4002kjsronwy1elfi`, `cmssx4x6w002mjsromc2eb9lv`, `cmssx4xll002ojsro6mv2r40x`, `cmssx4z5k002wjsros7imw02u`, `cmssx50c30032jsrooegd4g94`, `cmssx50q90034jsro04k0qr6g`, `cmssx51ia0038jsrob1pm7srf`, `cmssx52ad003cjsro8wva0a5k`, `cmssx53g9003ijsro7saqrwx0`, `cmssx54nj003ojsromn99297a`, `cmssx5bty004ojsro4q0cze45`, `cmssx5ela0052jsrovj76y75m`, `cmssx5ezl0054jsrownj322a9`, `cmssx5fs20058jsroovx4dfes`, `cmssx5qq2006qjsro7ub0g9ys`, `cmssx5r42006sjsro75cuhpc2`, `cmssx5rie006ujsroeow4yz85`, `cmssx5sox0070jsrofv9d85wz`, `cmssx5t3i0072jsrod9brrzza`, `cmssx4ozw001gjsro65w0xzgk`, `cmssx4u2b0026jsro9sqq3z0b`, `cmssx5516003qjsrozhwrk7dj`, `cmssx55f5003sjsrotf7n284f`, `cmssx57e10042jsro8l4ixph2`, `cmssx591v004ajsrolrw32sfz`, `cmssx5ozp006ijsro4s128fiv`, `cmssx60jj0084jsroyo72x002`, `cmssx61bl0088jsroq48jecg3`, `cmssx61q1008ajsrokridcbon`, `cmssx62iq008ejsroyy81lsqq`

## Gate 2 Combined State (original + Resume #1, exact 50)

- Gate 2 exact 50 distinct processed: **20 / 50** (initial 7 + resume 14 - 1 overlap `cmssx4s4m...`)
- distinct succeeded (QA_PASSED latest): **14** (initial 6 + resume 8, no overlap)
- distinct failed (latest FAILED): **6** (1 re-failed + 5 new; 3 QA_FAILED semantic + 1 timeout +1 schema_validation +1 server_error)
- incomplete (never processed across both runs): **30** (exactly the 30 above)
- total GQ rows for gate2 IDs: 82 (across history); latest per candidate 50 distinct: QA_PASSED 14 / QA_FAILED 25 / FAILED 11 (history includes pre-Gate2 rows)
- **New generation in these two runs:** QA attempted 18 (7+11), QA_PASSED 14 (6+8), QA_FAILED 4 (1+3) → semantic pass rate **77.8%** (14/18). Distinct current QA pass rate **82.4%** (14/(14+3)) — both ≥70% threshold
- provider final transient failures (new runs): **2** (timeout, server_error) — ≤5 threshold
- terminal failures (new runs): **1** (schema_validation_failed) — no code threshold breach but requires retry
- circuit_open: **0** (no breaker open)
- aborted: **true** (both runs incomplete due to tool timeout)
- duplicate generation: **0** (each target generated at most once per run; retry of `cmssx4s4m` is expected append, not duplicate)
- append-only integrity: **PASS** — new GQ delta 14 (225-211), new QA delta 11 (264-253), existing row UPDATE 0, DELETE 0, target-external 0
- dataset-audit: **PASS** — `npm run cbt:dataset-audit` → Master 39, error 0, warning 0
- runlog completeness: **NO** — both `4ab9931a` (7 items, no run_end) and `7ce774cd` (14 items, no run_end) lack run_end; 30 incomplete remain
- resume candidates for next resume (readRunLog of `7ce774cd`): **36** (failed 6 + incomplete 30)

## 현재 DB 핵심 totals (after Resume #1)
- CandidateQuestion: **160** (변동 없음)
- GeneratedQuestion: **225** (211 + 14) — APPROVED 39 / FAILED 56 (+3) / QA_FAILED 48 (+3) / QA_PASSED 82 (+8)
- GeneratedQuestionQA: **264** (253 + 11) — isPass true +8, false +3
- MasterQuestion: **39** (변동 없음)

## append-only / preservation 상태
- 재생성은 신규 UUID 행 append, 기존 overwrite/delete 금지(No Drop) — 전 과정 준수.
- Resume #1 14건 모두 신규 row. 기존 row 변경 없음.
- runId `7ce774cd`는 `4ab9931a`의 failedItemIds(44)를 정확히 resume, 원본 50 전체 재실행 없음.

## 테스트/검증 결과
- recovery Build: targeted 48/48, full CBT 535/535, typecheck/build/probe dry-run PASS (이전 세션)
- PREP validation: dry-run 50 / lint(check-env baseline 2 errors)/typecheck PASS/build PASS (PREP)
- INITIAL EXECUTION: readiness PASS, 7/50 processed, semantic pass 85.7%, dataset-audit PASS, append-only PASS, runlog incomplete
- RESUME #1: 14/44 processed, QA pass 8/11=72.7% in this run, combined 14/18=77.8% (distinct 82.4%), provider transient 2, terminal 1, dataset-audit PASS, append-only PASS, runlog incomplete

## Gate 2 / Bulk 상태
- Gate 2: **RESUME #1 INTERRUPTED** (cumulative 20 distinct processed / 50, runId `7ce774cd-482b-41ac-a200-65cfc8c2a3ea` pending, 36 resume candidates remain)
- Residual: **미실행**
- Bulk: **NO-GO** (미실행)
- Decision: **RESUME #2 CANDIDATE** — not SYSTEM PASS (aborted, 30 incomplete), not FAIL/BLOCKED

## 현재 blocker
- Gate 2 run `4ab9931a` + Resume `7ce774cd` 모두 tool timeout으로 중단됨 (cumulative 30 incomplete). code-enforced circuit_open/log_failure 아님.
- 1800s도 Gate 2 44건 concurrency=1 처리에 부족 (평균 ~2-3분/건, 44건 예상 ~90분). 다음 resume은 더 긴 timeout(3600s+) 또는 분할 전략 필요하나, 분할은 runbook에 없으므로 단일 resume으로 더 긴 timeout 권장.
- Human review용 기존 Gate 2 전용 export 없음 — DB query로 대체 (BLOCKER 아님).

## 다음 세션 Next Action
- 본 handoff와 `docs/cbt/gate2-runbook.md`, `docs/cbt/gate2-targets.txt`(hash 일치), `data/cbt/runs/4ab9931a-9e04-4839-81cb-8767561373a2.jsonl` 및 `data/cbt/runs/7ce774cd-482b-41ac-a200-65cfc8c2a3ea.jsonl` 확인.
- DB totals 225/264과 runlog 상태(incomplete) 확인.
- GPT/사용자 승인 후 **resume #2**로 남은 36건 처리:
  `npm run cbt:batch-generate -- --resume=7ce774cd-482b-41ac-a200-65cfc8c2a3ea --concurrency=1`
  (max 2 resume 중 2차 마지막. timeout 3600s+ 권장. --force 금지, provider/model 변경 금지)
- resume 없이 Human Review / residual / promote / Bulk 모두 별도 승인 전 금지.

## 금지사항
- Gate 1 전체 재실행 / 추가 retry / 다른 candidate 생성 금지 (완료 상태)
- Human Review / residual / Bulk / 신규 ingest 금지 (별도 승인 전, Gate 2 SYSTEM PASS 전)
- provider/model/baseUrl 변경 · `deepseek-v4-flash-free` 복귀 금지
- `response_format` 변경 · 불필요한 application code 수정 금지
- schema/migration 금지
- 기존 FAILED/기존 GQ/QA overwrite·delete 금지
- 관련 없는 untracked 파일 정리·commit 금지
- **두 번째 resume 자동 실행 금지** (이번 세션 1회만 승인됨)

## 기준 commit
- 이전 base HEAD: `c6692ec6c04c9d05df756dc2ea2f2122bd945649`
- 회복 빌드 반영 HEAD: `4ddedf0fa93be3b56639a03ca1d5519a8b76e5e3`
- Gate 1 Recovery 완료 HEAD: `5b2f6514c7596d1c49708d4592a67d9671a4832d`
- Gate 2 PREP HEAD: `97a61efbf54517294fd38ab0f83968a06590558c`
- Gate 2 INITIAL EXECUTION HEAD: `29de8c71b3fe8fc5514d90be0dae066129ac88e1`
- Gate 2 RESUME #1 HEAD: next commit after this handoff (본 파일 포함)
