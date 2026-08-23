# Gate 2 Operational Closeout Status

> **Base system decision:** `FAIL` (5 transient failures exceed the normal Gate 2 system threshold of ≤2).
> **Operational closeout decision:** bounded by the exact frozen excluded set.

## Frozen Scope

- Gate 2 candidate count: **50** (`docs/cbt/gate2-targets.txt`)
- Frozen gate hash: `8630715E0322C45EF04088BE431A22632399DF41372FE2647C04726559D18F20`
- Excluded count: **5** (10%)
- Allowed excluded reasons: `server_error`, `timeout`
- Circuit open count: **0**
- Promote eligibility: **false**

## Exact Frozen State

| Metric | Value |
|---|---|
| total | 50 |
| latest | 50 |
| terminal | 0 |
| incomplete | 0 |
| QA_PASSED | 39 |
| QA_FAILED | 6 |
| transient FAILED | 5 |
| resolved | 45 |
| coverage | 90% |
| resolved semantic pass | 86.6667% (≥ 70%) |
| dataset audit errors | 0 |
| dataset audit warnings | 0 |

## Excluded Entries (canonical)

| # | candidateId | generatedQuestionId | status | errorCode |
|---|---|---|---|---|
| 1 | `cmssx5bty004ojsro4q0cze45` | `cmt4bx1hq000408roa2888zqg` | FAILED | `server_error` |
| 2 | `cmssx5ezl0054jsrownj322a9` | `cmt4c1qgh000508roice9lvas` | FAILED | `server_error` |
| 3 | `cmssx5fs20058jsroovx4dfes` | `cmt3oevqt000xkcrorj7fuk1u` | FAILED | `server_error` |
| 4 | `cmssx591v004ajsrolrw32sfz` | `cmt3ouics001hkcro1w02q2fm` | FAILED | `timeout` |
| 5 | `cmssx60jj0084jsroyo72x002` | `cmt3p2asu001kkcroyrbbhr1d` | FAILED | `timeout` |

- Excluded candidate-only hash: `CBA301B81B479C65FEC95FC536112A0C12D2792B757280EF55941218E9A21B33`
- Excluded object-array canonical hash: `834FD3520523CE46DD1B7B20B335E92F64CF55AEBCEF2DE527D24C5AC471F754`

## Operational Result Naming

The operational closeout result is always one of:

- `GATE2_OPERATIONAL_CLOSEOUT_PASS`
- `GATE2_OPERATIONAL_CLOSEOUT_FAIL`

It is never `gate2Pass=true` and never relabels a normal Gate 2 system `PASS`.

## Append-Only Scope

The closeout append-only scope is exactly:

```text
frozen 50 candidate IDs
  -> their GeneratedQuestion rows
  -> attached GeneratedQuestionQA rows
```

- Scoped deletion/mutation → **FAIL**
- Scoped new append → **PASS**
- Unrelated candidate append → **PASS**

## Aborted Recovery Runs

Aborted recovery runs remain `aborted=true` and `passRelevant=false`. They may be preserved as historical evidence, but they are never completed relevant runs and cannot certify a closeout PASS.

## Promotion Guard

A Gate 2-derived promotion (all generated questions originate from the frozen 50 candidates) is blocked unless a valid `GATE2_OPERATIONAL_CLOSEOUT_PASS` manifest is provided. Non-Gate 2 promotion paths (residual 13, current pool 63, future bulk) are not required to provide this artifact and retain the existing global `APPROVED`-only behavior.

## CLI

```powershell
npm run cbt:gate2-closeout
npm run cbt:gate2-closeout -- --out-dir data/cbt/evidence/gate2-closeout
```

The CLI is read-only and never writes to production DB or calls external providers. Artifacts are written only when `--out-dir` is provided.

## Artifacts

When `--out-dir` is provided, the CLI emits:

- `closeout-baseline.json`
- `closeout-current.json`
- `closeout-manifest.json`

These artifacts are scoped to the frozen 50 candidates and do not retroactively modify existing PRE/FINALIZE evidence.

## BUILD Checkpoint (2026-08-22)

- Baseline HEAD: `ac6635d5123ce22b3efccf7f205788a4dfe602fc`
- Branch/worktree: `main`; pre-existing dirty worktree preserved
- BUILD model: Kimi K2.7 Code; final three bounded fail-closed corrections applied under Sol High emergency exception after repeated Kimi execution stalls
- Validation: focused closeout `38/38`; full `npm test` `843/843`; `npm run typecheck` PASS; `npm run build` PASS
- Lint: changed files have 0 errors; full-repository errors remain only in pre-existing `check-env-pattern.js` and `check-env.js`
- Production operations: provider/network, DB write, recovery, probe, canary, resume, Human Review, Promote, Bulk, migration, commit, and push all **0**
- Sol High review: **FINAL BUILD PASS**
- Next action: obtain separate approval before any production closeout execution; this BUILD did not create or finalize production evidence.

## Operational Closeout Checkpoint (2026-08-23)

- Baseline HEAD: `ac6635d5123ce22b3efccf7f205788a4dfe602fc`
- Immutable PRE: `218cf09f-50e0-4d21-9ac9-ac90968e155f`
- Artifact directory: `data/cbt/evidence/gate2-closeout`
- Artifact verifier: `verifyCloseoutEvidence.valid=true`
- Operational decision: **`GATE2_OPERATIONAL_CLOSEOUT_PASS` / COMPLETE**
- Base strict system decision: **FAIL** (unchanged)
- Persisted manifest: append-only true; scoped deleted 0; scoped mutated 0; audit errors 0; audit warnings 0; circuit open 0; promote eligibility false
- Raw artifact hashes bound and sidecar verified; exact frozen target/excluded sets and recovery-history evidence verified
- Sol High final decision: **FINAL GATE 2 CLOSEOUT DECISION — COMPLETE**
- Production restrictions: Contract Canary, Provider Recovery, Provider Probe, Resume #3, Human Review, Promote, Bulk, migration, DB write, provider/network call, commit, and push all **0**
- Note: a post-artifact rerun of the npm evaluators hit local Node `uv_os_get_passwd ENOMEM` before application code; prior successful preflight plus closeout CLI and full verifier remain authoritative.
- Next action: **STOP**. Any Gate 3 Human Review or Promote requires a separate explicit approval.
