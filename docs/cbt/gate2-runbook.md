# CBT Gate 2 Controlled Expansion — Final Runbook

> Phase A PREP 기준 HEAD: `5b2f6514c7596d1c49708d4592a67d9671a4832d`
> 상태: PREP / execution baseline 확정
> Provider/model: `openai-compatible` / `deepseek-v4-flash`
> Auto-QA: `step8-auto-qa-v3.1`
> concurrency: `1`
> created: 2026-08-22 (Phase A)

---

## A. Gate 2 Definition

Gate 1 Recovery(10건) 완료 후, Bulk 전체 확대 이전에 수행하는 controlled expansion.

- Gate 2 = 50건 generation + Auto-QA.
- Gate 2 SYSTEM PASS → 전수 Human Review → HUMAN ACCEPTED → Residual 13.
- Residual 13 SYSTEM PASS → 전수 Human Review → HUMAN ACCEPTED → current pool 전체(63건) APPROVED에 대해 **일괄 promote**.
- Gate 2 단독 promote 금지.

---

## B. 50 + Residual 13 Rationale

- eligible 63건 중 50건(79%)을 Gate 2로 확대. 카테고리 비례 유지.
- 잔여 13건은 residual completion으로 처리. Gate 3라 부르지 않음.
- 50건은 역사적 10→50→100 원칙의 다음 단계에 해당하나, 현재 eligible 63이라는 현실을 우선하여 current pool completion(63건)까지만 정의하고 future bulk(100건 이상 신규 ingest)는 별도 PLAN으로 분리.

---

## C. Exact Category Allocation

| Category | Selected | Eligible |
|---|---|---|
| CAT-HANDLING | 9 | 11 |
| CAT-LAW | 9 | 11 |
| CAT-SAFETY | 21 | 26 |
| CAT-SERVICE | 11 | 15 |
| **합계** | **50** | **63** |

각 카테고리 내 `createdAt asc`로 오래된 candidate부터 선택.

---

## D. Exact 50 UUID

```text
cmssx4qye001qjsroptfyzx32
cmssx4s4m001wjsrojuubfwm8
cmssx532d003gjsroyu02pm16
cmssx57tr0044jsrorrdqjmvn
cmssx5k25005ujsroi4y3xjaw
cmssx5ktj005yjsroke1u37e5
cmssx5l7w0060jsronmzfahz5
cmssx5m0g0064jsropgj5a38n
cmssx5men0066jsrovtuz3l16
cmssx4f200000jsrodt27wuxv
cmssx4f8p0002jsro2p3mc4x0
cmssx4irv000kjsrot5wjf8dz
cmssx4l4c000wjsroggq19468
cmssx4moj0014jsrodzpmkh6t
cmssx4n2m0016jsrot2u3yxfd
cmssx5bgm004mjsrols1xc8hg
cmssx5d0h004ujsrol1wsdodv
cmssx5hpd005ijsro16e81o9m
cmssx4gf40008jsrokq14xs9x
cmssx4uub002ajsro1cjdxrg7
cmssx4wt4002kjsronwy1elfi
cmssx4x6w002mjsromc2eb9lv
cmssx4xll002ojsro6mv2r40x
cmssx4z5k002wjsros7imw02u
cmssx50c30032jsrooegd4g94
cmssx50q90034jsro04k0qr6g
cmssx51ia0038jsrob1pm7srf
cmssx52ad003cjsro8wva0a5k
cmssx53g9003ijsro7saqrwx0
cmssx54nj003ojsromn99297a
cmssx5bty004ojsro4q0cze45
cmssx5ela0052jsrovj76y75m
cmssx5ezl0054jsrownj322a9
cmssx5fs20058jsroovx4dfes
cmssx5qq2006qjsro7ub0g9ys
cmssx5r42006sjsro75cuhpc2
cmssx5rie006ujsroeow4yz85
cmssx5sox0070jsrofv9d85wz
cmssx5t3i0072jsrod9brrzza
cmssx4ozw001gjsro65w0xzgk
cmssx4u2b0026jsro9sqq3z0b
cmssx5516003qjsrozhwrk7dj
cmssx55f5003sjsrotf7n284f
cmssx57e10042jsro8l4ixph2
cmssx591v004ajsrolrw32sfz
cmssx5ozp006ijsro4s128fiv
cmssx60jj0084jsroyo72x002
cmssx61bl0088jsroq48jecg3
cmssx61q1008ajsrokridcbon
cmssx62iq008ejsroyy81lsqq
```

---

## E. Tracked Target Path

- `docs/cbt/gate2-targets.txt` — **tracked**
- 형식: UUID 50줄, 1 line = 1 UUID, header/comment/blank line 없음, UTF-8, LF, 마지막 trailing LF 1개.

---

## F. Actual SHA-256

```
8630715E0322C45EF04088BE431A22632399DF41372FE2647C04726559D18F20
```

계산:
```powershell
Get-FileHash docs/cbt/gate2-targets.txt -Algorithm SHA256
```
사전 계산된 값은 사용하지 않는다. 본 값이 source of truth.

---

## G. PREP DB Baseline

- CandidateQuestion: 160
- GeneratedQuestion: 204 (APPROVED 39 / FAILED 53 / QA_FAILED 44 / QA_PASSED 68)
- GeneratedQuestionQA: 246 (v3.1: PASS 35 / FAIL 13 / timeout 5 / empty_response 6)
- MasterQuestion: 39
- general eligible: 63
- Gate 2 50 target 존재 50 / VALID 50 / REJECTED 0 / gqs 61(FAILED 26 + QA_FAILED 35) — 모두 retryable.

---

## H. PREP Dry-Run Result

```powershell
npm run cbt:batch-generate -- --ids-file=./docs/cbt/gate2-targets.txt --dry-run
```

출력:
- `dry-run: 처리 대상 50건, 스킵 0건`
- `dry-run: 예상 LLM 호출 수 100 (LLM/DB 기록 없음)`
- `dry-run: 카테고리 분포 CAT-HANDLING=9 CAT-LAW=9 CAT-SAFETY=21 CAT-SERVICE=11`

---

## I. Execution Prerequisites (fail-closed)

- tracked diff 0
- staged 0
- HEAD == origin/main == PREP baseline HEAD
- target file hash == runbook 기록 hash
- DB eligibility가 PREP baseline과 일치(50개 모두 VALID/eligible, 신규 ingest 없음)
- `npm run cbt:provider-probe -- --dry-run` PASS
- 별도 승인 후 `npm run cbt:provider-probe -- --run` 1회 PASS

어느 하나 불일치 시 execution 금지, GPT/사용자 재승인 대기.

---

## J. Exact Gate 2 Command

```powershell
npm run cbt:batch-generate -- --ids-file=./docs/cbt/gate2-targets.txt --concurrency=1
```

fallback:
```powershell
npm run cbt:batch-generate -- --ids=cmssx4qye001qjsroptfyzx32,... --concurrency=1
```

---

## K. Runtime

- provider: `openai-compatible`
- baseUrl: `https://opencode.ai/zen/v1`
- model: `deepseek-v4-flash`
- Auto-QA: `step8-auto-qa-v3.1`
- response_format/temperature/retry/endpoint 변경 없음.

---

## L. Retry/Resume Semantics

- 대상: outcome=failed + item_result 없는 incomplete.
- 정상 item / 정상 GQ 보유 candidate / REJECTED 제외.
- resume마다 새 runId.
- 1차 resume 실패 시 반드시 1차 resume이 만든 최신 runId로 2차 resume.
- 최대 resume runs = 2. 초과 시 FAIL/BLOCKED.
- 명령:
  ```powershell
  npm run cbt:batch-generate -- --resume=<runId> --concurrency=1
  ```

---

## M. STOP Hierarchy

### CODE-ENFORCED LIVE STOP
- provider transient 연속 5회 → circuit_open
- semantic QA_FAILED 연속 10회 → circuit_open
- runlog append 실패 → aborted/log_failure
- 위 발생 시 남은 target은 `circuit_open`/`runlog_broken`으로 단락.

### OPERATOR-OBSERVABLE LIVE STOP
stdout/runlog의 최종 item_result 기준:
- 최종 FAILED item_result가 연속 누적(예: provider transient/terminal)
- `circuit_open` 출력
- `log_failure` / `aborted=true`
- terminal failure item_result
- CLI abort / unexpected DB/config condition
- 내부 retry attempt 횟수는 관측 불가이므로 live stop 기준으로 사용하지 않는다.

### POST-RUN FAIL THRESHOLD
run 종료 후 계산:
- aborted
- terminal failure
- final transient failures
- QA semantic pass rate
- dataset audit
- runlog completeness
- append-only integrity

---

## N. Logical Quarantine

새 quarantine 폴더/파일 금지. 실패 항목은 다음으로 추적:

- GeneratedQuestion: status=FAILED|QA_FAILED, errorCode, errorMessage, provider, model
- GeneratedQuestionQA(해당 시): errorCode, errorMessage
- runId + item_result.detail

---

## O. Runlog/DB Integrity

### 회피 금지
`item_result count == GQ delta` 공식은 사용하지 않는다.

### 근거
- `circuit_open` item은 `runContentProduction` 미호출 → GQ row 생성 없음, item_result는 존재.
- runlog incomplete는 `run_start.targets` 중 `item_result` 없는 항목.
- `aborted/log_failure` 시 일부 target은 미처리.

### 검증 절차
target_id 기준으로:

1. `run_start.targets` 50개 확인.
2. `item_result` outcome 집계.
3. `aborted`/`abortReason` 확인.
4. GQ 존재 여부: `SELECT * FROM generated_questions WHERE candidateQuestionId IN (...) ORDER BY createdAt DESC` 로 최신 row 매핑.
5. QA 존재 여부: `SELECT * FROM generated_question_qas WHERE generatedQuestionId = $gqId`.
6. status/errorCode/runId 시각 연관 확인.

#### Normal completion(50건 모두 처리)
- GQ delta = 50 (항상 1건 append)
- QA delta = generation 성공 건수 (= 50 - fact_extraction_failed - generation_failed)
- `run_end` 존재, `aborted=false`.

#### Aborted/circuit/log failure
- GQ delta = 실제 처리된 target 수 (`item_result` 중 GQ 생성된 수)
- QA delta = 그 중 QA까지 도달한 수
- `run_end`의 `aborted/abortReason`, `item_result` 미포함 incomplete 대상 확인.

---

## P. SYSTEM PASS

최소:
- `aborted=false`
- terminal failure = 0
- breaker unresolved = 0
- provider transient final failures ≤ 5 (≤10%)
- max 2 resume 후 final transient ≤ 2
- **semantic QA pass rate ≥ 70%** (denominator = QA_PASSED + QA_FAILED)
- dataset-audit error = 0
- runlog complete(`run_start`→`item_result`→`run_end`)
- append-only integrity(기존 row 변경 0)

근거: v3.1 completed evaluation 35/(35+13)=72.9%, Gate 1 10/10 pass.

---

## Q. Human Review

- SYSTEM PASS 후 QA_PASSED **전수**를 human-readable 자료로 검토.
- `batch-review`는 review UI가 아니라 상태 기록 도구임.
- 기존 repo에는 Gate 2 전용 markdown export가 없음.
- **기존 적절 경로**: `tools/cbt/cli-reqa.ts --report`(REQA 38건 전용) 및 `cbt:dataset-audit`은 있음. **Gate 2 QA_PASSED 전수에 대해서는 DB read-only query로 human-readable JSON/Markdown을 생성.**
- 예시(READ-ONLY):
  ```powershell
  npx tsx -e 'require(`dotenv/config`); const {prisma}=require(`@/lib/prisma`); async function main(){ const gqs=await prisma.generatedQuestion.findMany({where:{status:`QA_PASSED`, candidateQuestionId:{in:[...gate2Ids...]}}}); console.log(JSON.stringify(gqs.map(g=>({id:g.id, questionText:g.questionText, choices:g.choices, answers:g.answers, explanation:g.explanation})),null,2)); } main().finally(()=>prisma.$disconnect())'
  ```
- QA_PASSED 자동 approve 금지. 사람이 실제 문제 내용을 검토 후 승인할 GQ ID를 명시.

---

## R. HUMAN ACCEPTED Criteria

- review 대상 완료율 100%
- 정답 오류 0
- 치명적 factual error 0
- 명백한 불완전 문제 0
- reject는 status REJECTED로 history에 보존.
- 승인된 ID에 대해서만 `batch-review --action=approve` 실행:
  ```powershell
  npm run cbt:batch-review -- --action=approve --ids=<gq-id-1>,<gq-id-2>,... --reviewer=<operator-id>
  ```

---

## S. Residual 13

- Gate 2 HUMAN ACCEPTED 후 별도 사용자/GPT 승인 필요.
- `docs/cbt/residual-targets.txt`로 freeze (13건: HANDLING 2 / LAW 2 / SAFETY 5 / SERVICE 4).
- 동일 dry-run / readiness / generation / QA / review 원칙 적용.
- `npm run cbt:batch-generate -- --ids-file=./docs/cbt/residual-targets.txt --concurrency=1`

---

## T. Promote Timing

- Gate 2 50 + residual 13 모두 HUMAN ACCEPTED 후에 current pool 전체 APPROVED에 대해 일괄 promote.
- Gate 2 단독 promote 금지.
- 명령:
  ```powershell
  npm run cbt:batch-promote -- --ids=<approved-gq-id-1>,... --dry-run
  npm run cbt:batch-promote -- --ids=<approved-gq-id-1>,...
  ```

---

## U. Current Pool Completion

Gate 2 50 SYSTEM PASS + HUMAN ACCEPTED + residual 13 SYSTEM PASS + HUMAN ACCEPTED → current pool 63 전체 검증 완료.

---

## V. Future Repeatable Bulk Boundary

- current pool 63 = **CURRENT POOL COMPLETION**
- future bulk = 100건 이상 신규 ingest에 대한 repeatable operation
- bulk 정책은 별도 PLAN 대상. 현재 63 완료와 분리.

---

## W. Fail-Closed Rules

다음 시 자동 다음 단계 진행 금지:
- readiness probe FAIL
- target hash mismatch
- DB baseline 불일치
- circuit_open
- log_failure
- terminal failure threshold 초과
- system PASS threshold 미충족
- human review 미완료
- unexpected DB mutation
- model/provider/config 변경

FAIL/BLOCKED 시 residual/Bulk 자동 금지.

---

## X. Session-Close Rules

- PASS/FAIL/BLOCKED 상관없이 `docs/AI_HANDOFF.md` 갱신
- 관련 변경 commit/push
- STOP 후 GPT의 Gate 2 EXECUTION 별도 승인 대기.

---

## Y. Gate 2 Post-Failure Recovery v1 (Resume #3 대체 전용 policy)

Resume #3는 금지다. `cbt:batch-generate -- --resume=...`는 recovery runlog를 source로 거부한다.
대신 승인된 별도 실행에서만 `cbt:gate2-recovery -- --lane=contract|provider`를 사용한다.

- frozen 대상은 코드에 고정된 candidate ID, target count, canonical SHA-256 hash, expected latest GQ id/status/errorCode로 검증한다.
- preflight가 하나라도 불일치하면 runlog를 만들거나 provider/DB write를 시작하지 않는다.
- 각 target은 순차(concurrency=1)로 한 번만 `runContentProduction`을 호출한다. 기존 provider 내부 retry 설정은 변경하지 않는다.
- Contract lane은 `5rie` 하나만 대상으로 하며 QA_PASSED/QA_FAILED면 완료, transient 또는 terminal이면 즉시 중단한다.
- Provider lane은 8 transient target만 대상으로 하며 연속 transient 2회, terminal 1회, runlog failure면 즉시 중단한다.
- recovery run_start에는 runType, policyVersion, lane, parent Resume #2 runId, targetSetHash를 기록한다. 일반 resume source로 재사용할 수 없다.
- provider probe와 recovery는 별도 승인이다. recovery CLI가 probe를 실행하지 않는다.
- 최종 Gate 2 판정은 original final-50의 latest state만으로 terminal=0, transient<=2, semantic pass>=70%, complete relevant runlogs, circuit=0, audit=0, append-only integrity 통과를 모두 만족해야 PASS다. integrity evidence는 gate target hash, relevant recovery runId 목록, baseline identity, pre/post snapshot identity에 결속되고 historical mutation/target external change가 모두 0이어야 한다. 누락·stale·불일치는 PASS가 아닌 FAIL이다.

---

## Z. Gate 2 Integrity Evidence Binding (Gate 2 전용, PRE → FINALIZE 불변 결속)

Gate 2 Recovery의 append-only 무결성을 증명하기 위한 전용 evidence 바인딩. Provider Recovery #2 / Probe / Resume #3 / Promote와 분리되며, DB는 read-only(스냅샷), 파일은 exclusive `wx`로 불변 보장한다.

### Z.1 PRE (read-only DB snapshot)

- 대상: `docs/cbt/gate2-targets.txt` 50개 frozen target + 해당 lane의 frozen policy (`CONTRACT`/`PROVIDER`) — `hashTargetIds` canonical SHA-256 검증.
- baseline identity: `candidateQuestionId / latestGeneratedQuestionId / latestStatus / latestErrorCode` 를 candidateId lexical 정렬 → `canonicalJsonString` (재귀 lexical key, UTC ISO, explicit null) → SHA-256(upper).
- 스냅샷: **모든** `GeneratedQuestion` / `GeneratedQuestionQA` 행을 `id` lexical 정렬 → 재귀 lexical canonical → JSONL+LF → SHA-256. 개별 GQ/QA 해시와 결합 `preSnapshotIdentity = hash({generatedQuestionsHash, generatedQuestionQAsHash})`.
- 출력: `data/cbt/evidence/gate2/<evidenceId>/` — gitignored, `wx` exclusive 생성:
  - `pre.json` (manifest: gateTargetHash, baselineIdentity, preSnapshotIdentity, counts, lane/policyVersion/parentRunId/targetSetHash)
  - `generatedQuestions.json`, `generatedQuestionQAs.json`, `baseline.json` (canonical)
- 명령:
  ```powershell
  npm run cbt:gate2-integrity -- pre --evidence-id <uuid> --lane contract|provider --target-ids-file docs/cbt/gate2-targets.txt
  npm run cbt:gate2-integrity -- pre --evidence-id <uuid> --lane provider
  ```
  동일 `evidenceId` 재사용 시 `EEXIST`로 거부(덮어쓰기 불가).

### Z.2 FINALIZE (post 검증 + binding)

- 입력: `pre` evidenceId + recovery `runId`.
- 검증:
  1. `pre.json` 및 스냅샷 파일 해시 재계산이 manifest와 일치.
  2. `run_start` 의 `lane / policyVersion / parentRunId / targetCount / targetSetHash` 가 `pre` 및 frozen policy와 일치.
  3. `run_end` 존재 및 `aborted !== true` (aborted run `e765495f-1351-4a9f-bfde-e1730033710f` 는 사전 증적 없는 중단으로 **절대 PASS 증적 불가**, `--run-id`로 지정 시 fail-closed).
  4. runlog 파일 원문 SHA-256(`runlogHash`) 기록.
  5. post DB 스냅샷 재취득 후 **PRE 모든 행이 불변**이고 오직 신규 append만 허용. 삭제/deletion 또는 필드 mutation(QA 포함)이 1건이라도 있으면 `appendOnlyPassed=false`, `historicalMutationCount / targetExternalChangeCount >0`.
- 출력 (동일 `evidenceId` 디렉터리에 `wx` 불변):
  - `postGeneratedQuestions.json`, `postGeneratedQuestionQAs.json`
  - `post.json` (postSnapshotIdentity, runlogHash, appendOnlyPassed, mutation counts)
  - `binding.json` (preManifestHash, postManifestHash, runlogHash, baseline/pre/post identities 암호학적 참조)
  - `final-manifest.json` (evaluator가 소비하는 `Gate2IntegrityEvidence` + 검증 해시: preManifestHash/postManifestHash/bindingHash/runlogHash)
- 명령:
  ```powershell
  npm run cbt:gate2-integrity -- finalize --evidence-id <pre-uuid> --run-id <recovery-runId>
  ```

### Z.3 Evaluator 바인딩 검증

- `cbt:gate2-evaluate`는 기본 **fail-closed**: `--evidence` 없으면 `relevantRuns=[]`, `integrityEvidence` 없음 → `append-only integrity evidence...` 사유로 FAIL.
- `--evidence <path>` (디렉터리 또는 `final-manifest.json` 파일) 제공 시:
  1. `final-manifest.json`의 `preManifestHash / postManifestHash / bindingHash / runlogHash` 를 각 파일 원문 SHA-256과 대조.
  2. `binding.json`의 참조 해시 대조, runlog 실제 파일 해시 대조, 스냅샷 canonical 해시 대조.
  3. 하나라도 불일치·변조·누락 시 **invalid evidence → FAIL** (PASS 절대 불가).
  4. 검증 통과 시 `final-manifest.json`의 `integrityEvidence` (`gateTargetHash`, `relevantRunIds`, `baselineIdentity`, `preSnapshotIdentity`, `postSnapshotIdentity`, `appendOnlyPassed`, `historicalMutationCount`, `targetExternalChangeCount`)를 기존 `evaluateGate2Final`에 그대로 전달. 기존 semantic 임계(terminal≤0, transient≤2, pass≥70% 등)는 완화 없이 유지.
- `--run-id <id>` 단독은 fail-closed(증적 없이 PASS 불가). `--evidence`와 함께 사용 시 evidence의 `relevantRunIds`에 해당 runId가 포함되어야 하며, 해당 run이 `aborted`거나 `run_end` 없으면 finalize 단계에서 이미 거부되어 유효 evidence가 존재할 수 없으므로 FAIL.
- 기존 `e765495f-1351-4a9f-bfde-e1730033710f`는 aborted이며 pre 증적이 없으므로 사후 인증 불가. 해당 runId로 finalize/evaluate를 시도하면 fail-closed.

### Z.4 불변성/보안

- 모든 증거 파일은 `writeFile(..., {flag:"wx"})` 로 생성 — 기존 파일이 있으면 `EEXIST` throw, 덮어쓰기 금지.
- `data/`는 `.gitignore`로 추적 제외이며, 증거는 파일 해시 체인으로 변조 탐지.
- Provider/network 호출 금지, production DB 쓰기 금지, Prisma/schema/migration 변경 금지, question/QA/recovery 로직 변경 금지.
- 테스트는 temp fixtures만 사용하며, `tools/cbt/batch/gate2-integrity-evidence.test.ts` 및 `tools/cbt/cli-gate2-evaluate.test.ts`에서 deterministic ordering, append-only valid/deletion/mutation/QA mutation, target/policy/parent/runlog mismatch, missing run_end, aborted rejection, overwrite/tamper rejection, no-evidence fail-closed, valid binding, no network/DB write를 검증.

---

## AA. Bounded Operational Closeout (Gate 2 Closeout)

Gate 2 has a bounded operational closeout layer that is separate from the normal Gate 2 system PASS.

- **Base system decision:** `FAIL` — the final frozen state contains 5 transient failures, which exceeds the normal Gate 2 system threshold of ≤2.
- **Operational result names:** `GATE2_OPERATIONAL_CLOSEOUT_PASS` or `GATE2_OPERATIONAL_CLOSEOUT_FAIL`. Never `gate2Pass=true` and never a relabeled normal Gate 2 `PASS`.
- **Frozen scope:** exactly the 50 candidates in `docs/cbt/gate2-targets.txt` with the frozen hash `8630715E0322C45EF04088BE431A22632399DF41372FE2647C04726559D18F20`.
- **Exact frozen state:** 50 total, 50 latest, 0 terminal, 0 incomplete, 39 QA_PASSED, 6 QA_FAILED, 5 transient FAILED, 45 resolved, 90% coverage, 86.6667% semantic pass, 0 audit errors, 0 audit warnings.
- **Excluded set:** 5 candidates with canonical hashes `834FD3520523CE46DD1B7B20B335E92F64CF55AEBCEF2DE527D24C5AC471F754` (object array) and `CBA301B81B479C65FEC95FC536112A0C12D2792B757280EF55941218E9A21B33` (candidate-only). Excluded reasons are only `server_error` and `timeout`; `circuit_open=0`; promote eligibility is `false`.
- **Append-only scope:** exactly the frozen 50 candidates → their `GeneratedQuestion` rows → attached `GeneratedQuestionQA` rows. Scoped deletion/mutation fails; scoped new append passes; unrelated candidate append passes.
- **Aborted recovery runs:** remain `aborted=true` and `passRelevant=false`; historical evidence is preserved, but aborted runs never become completed relevant runs.
- **Promotion guard:** a Gate 2-derived promotion (all generated questions originate from the frozen 50 candidates) is blocked unless a valid `GATE2_OPERATIONAL_CLOSEOUT_PASS` manifest is provided. Other promotion paths (residual 13, current pool 63, future bulk) are not required to provide this artifact and keep the existing global `APPROVED`-only behavior.
- **CLI:** `npm run cbt:gate2-closeout` (read-only, optional `--out-dir` artifact emission). No provider calls, no production DB writes.
- **Artifacts:** `closeout-baseline.json`, `closeout-current.json`, `closeout-manifest.json` (or PRE/POST patterns if existing conventions require). Existing PRE evidence remains immutable historical baseline and is not retroactively certified.
- **Status document:** see `docs/cbt/gate2-closeout-status.md` for the full canonical state and hashes.
