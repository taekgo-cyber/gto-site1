# CBT exact-80 source handoff

This tooling transfers only the canonical source rows required by the existing
`MasterQuestion -> CbtQuestion` publication service. It does not publish CBT
questions or change sample questions.

## Minimum source graph

| Table | Class | Exact rows | Reason |
| --- | --- | ---: | --- |
| `CandidateQuestion` | A — required | 80 | `GeneratedQuestion` FK plus publication source identity, URL, and fingerprint |
| `GeneratedQuestion` | A — required | 80 | `MasterQuestion` FK plus `APPROVED` status and generated fingerprint |
| `MasterQuestion` | A — required | 80 | Canonical question, answer, explanation, category, difficulty, and active publication state |
| exact-80 manifest | B — audit | 1 | Frozen identity graph, known-bad exclusions, and expected checksum |
| `GeneratedQuestionQA` | B — audit only, not copied | 0 | The frozen manifest proves the QA selection; publication does not query QA rows |
| `CandidateReview` / duplicate/history rows | C — optional, not copied | 0 | Not queried by publication and not needed for FK viability |
| `CbtQuestion`, samples, activity, exam, user/auth rows | D — must not copy | 0 | Runtime targets and user data are outside source handoff scope |

The bundle deliberately omits raw HTML pointers, raw HTML, raw LLM responses,
users/auth data, activity/exam data, and unrelated candidates or masters.

## Contracts

- The manifest checksum must be
  `1979a83ca20db5423599a48224571765bbd65c9fd1edd9b5e9948198c4944f07`.
- Export is local-loopback and read-only. It reads the exact graph twice and
  requires the source fingerprint to remain unchanged.
- Bundle ordering and checksums are deterministic. `exportedAt` is metadata and
  is intentionally excluded from the canonical bundle checksum.
- Staging preflight rejects Production, non-tunneled database URLs, missing
  migrations/columns/enums, missing or inactive `cargo-driver`, and any content
  conflict. It performs no writes.
- Import is create/no-op only. It requires the exact approval sentence and the
  unchanged preflight plan checksum, recomputes the plan inside one transaction,
  inserts Candidate -> Generated -> Master, and verifies read-back.
- Import never updates, deletes, reconciles, publishes, or changes sample rows.

## Commands

Export a local ignored bundle:

```text
npm run cbt:source-handoff:export -- --output <ignored-json-path> --branch <branch> --head <40-char-sha>
```

Run the Staging zero-write preflight through an approved local tunnel:

```text
npm run cbt:source-handoff:preflight -- --bundle <ignored-json-path> --report <ignored-report-path>
```

The preflight process requires these non-secret identity markers in addition to
the tunneled `DATABASE_URL`:

```text
CBT_HANDOFF_PROJECT=gto-site1-production
CBT_HANDOFF_ENVIRONMENT=staging
CBT_HANDOFF_SERVICE=gto-web
CBT_HANDOFF_PRODUCTION_EMPTY=true
CBT_HANDOFF_TUNNEL_PORT=55432
```

The mutation command exists for the next explicitly approved Gate. Do not run it
as part of preflight. It requires `--expected-plan` and the exact approval text
exported as `CBT_SOURCE_IMPORT_APPROVAL` in `import.ts`.
