# Residual 13 — R3 BUILD boundary

Status: R2 `PASS`; R3 `BUILD ONLY`.

This boundary is bound to the immutable R1 reconstructed freeze at
`data/cbt/evidence/residual-13/residual-r1-ab55d9b7f4c3/`. The freeze contains
13 candidates in order: Lane A (transient) has 9 and Lane B (semantic) has 4.
Each candidate has at most one future logical pipeline attempt. Provider retry
inside that one call remains the existing contract (60s timeout, three retries,
1s base delay). There is no resume, force rerun, failed-only second pass, or
semantic second regeneration.

The BUILD layer validates the R1 raw hashes, exact lane identity, latest-state
identity, prompt/provider contract, and append-only evidence. `QUARANTINED_*`
is an evidence outcome only; no database status or schema is added. Only a new
`QA_PASSED` result can later enter a separate Human Review checkpoint.

Safe provider-free commands:

```powershell
npm run cbt:residual-13 -- --lane=transient --preflight
npm run cbt:residual-13 -- --lane=semantic --preflight
npm run cbt:residual-13 -- --lane=transient --dry-run
npm run cbt:residual-13 -- --lane=semantic --dry-run
```

These commands do not call a provider or write the database. Production
`--execute` is intentionally guarded by an explicit confirmation token and is
outside this BUILD. The execute path is structurally wired to capture a fresh
read-only live snapshot, revalidate it before loading the production adapter,
and then invoke the existing content pipeline only after the exact token and
configuration checks pass; this path is not invoked by BUILD or tests. Any R1 drift, target drift, config drift, append-only
mutation/deletion, incomplete lane, schema need, or repeated execution blocker
is fail-closed and requires Sol High review.

## R3.1 PRE checkpoint — PASS (provider-free)

The residual-only pre-execution reconciliation completed without provider calls
or database writes. The immutable R1 binding matched 13/13 live candidates,
13 historical GeneratedQuestion rows, and 7 historical QA rows. Latest-state
drift, unexpected GQ append, missing frozen latest GQ, duplicate candidate rows,
and Gate50 intersection were all zero. Dataset audit was `error=0` and
`warning=0`.

Execution target bindings are fixed as follows:

- all 13: `2BC58EDB672FB49510563995161F7105303C3BBAD276354A199DAC6F8570CC6F`
- Lane A transient exact 9: `A7DAC798A71CBDB65A25E9CA7CE9D54B8DBB88E073AEE71EE6188A67FDB8F357`
- Lane B semantic exact 4: `AB245640FAF73DA1B5EDDBF79A9B130AC22FACC7D8578F79913D5418309DFA2E`

The current-state replay of the historical Gate 2 closeout evaluator is not a
new Gate 2 verdict: Gate 3 status transitions make that replay inapplicable to
the immutable historical Gate 2 decision. Gate 2 evidence is not rewritten or
re-finalized. Lane A remains the only possible next production unit; Lane B is
held for a separate later approval. Both production executes remain NO-GO.

The selective local checkpoint is commit `2b88e31` (`cbt: prepare bounded
residual execution`). Remote push is deferred by the safety guard; no push
workaround, force push, alternate remote, or unrelated export was attempted.

## Follow-up environment blocker — STOP

On 2026-08-23, provider-free transient and semantic preflight/dry-run
attempts were blocked before application startup by Node
`uv_os_get_passwd ENOMEM`. A serial retry and the Codex-bundled Node runtime
reproduced the same failure. No provider request or database write occurred;
Lane A and Lane B production execution remain NO-GO pending environment
recovery and a fresh provider-free invariant check.

## R10B — Lane A execution-uncertain quarantine evidence

R10B adds a residual-only, provider-free evidence boundary for the previously
observed Lane A command whose provider-attempt result and CLI completion were
unknown. It does not rerun Lane A and does not alter the existing residual
runner, pipeline, provider, prompts, QA evaluator, database schema, Gate 2,
Gate 3, Human Review, Promote, or immutable R1 artifacts.

The new preflight performs R1 hash/identity verification and an injected
read-only Prisma `findMany` forensic check. It requires exact Lane A identity,
`exact9TotalGQ=9`, `baselineGQCount=9`, `newGQCount=0`, `newQACount=0`, and zero
candidate/Gate50 contamination. The write mode requires the explicit
`QUARANTINE_LANE_A_EXECUTION_UNCERTAIN` confirmation and appends only a new
JSON evidence artifact plus SHA-256 sidecar; collisions fail closed.

The evidence truth is preserved as:
`attempted=UNKNOWN`, `logicalAttemptCount=UNKNOWN`, `providerCall=UNKNOWN`,
`dbWrite=0`, `rerunAllowed=false`, `humanReviewEligible=false`, and
`promoteEligible=false`. Lane A production rerun and Lane B execution remain
NO-GO.

## Final closeout reconciliation — 2026-08-23

R13 Lane A exact9 completed exactly once and passed its bounded execution
contract: `targetCount=9`, `attemptedCount=9`, `resolutionComplete=true`, 9 new
GeneratedQuestion rows, 8 new QA rows, 4 `QA_PASSED`, 4 `QA_FAILED`, and 1
transient `FAILED` (`server_error` / HTTP 503). Execution uncertainty is
resolved and frozen Gate2-50 overlap is zero. R13 must not be rerun.

R11F execution-uncertainty evidence remains immutable, including its historical
`UNKNOWN` semantics. R12's Lane A rerun guard remains implemented and validated.

The Gate2 frozen set remains 50 candidates with hash
`8630715E0322C45EF04088BE431A22632399DF41372FE2647C04726559D18F20`.
Gate2 closeout is a pre-promotion contract: `QA_PASSED` is the successful
closeout state. `APPROVED` is the later human-review lifecycle state and must
not be re-evaluated as a new live Gate2 snapshot. The historical same-set
authoritative snapshot is 37 `QA_PASSED`, 6 `QA_FAILED`, and 7 `FAILED`;
the previously quoted 37/5/8 metric is retired as non-authoritative.

The current post-promotion frozen-50 lifecycle state is 39 `APPROVED`, 6
`QA_FAILED`, 5 transient `FAILED`, 0 terminal `FAILED`, and 0 genuinely
incomplete. R14 confirmed that no evaluator or lifecycle code change is
required. Gate2 and R13 must not be rerun.
