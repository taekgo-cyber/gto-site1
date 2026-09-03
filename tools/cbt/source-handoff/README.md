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

## Git and artifact policy

Git is the source of truth for the canonical identity and verification contract,
not a distribution channel for CBT source-derived content. Question text,
choices, answers, explanations, and Candidate/Generated/Master source bundles
must remain ignored and must not be force-added to the repository, including
when a bundle is otherwise data-minimized.

The verified bundle under `data/cbt/evidence/launch-closeout-80/` is an
operator-managed release artifact. It must remain unchanged and ignored. Before
operational use, an operator must verify its checksum against the tracked
contract below. An immutable private artifact store has not yet been provisioned;
durable storage, stable identity, a redundant backup, and retrieval instructions
remain the `CBT OPERATOR ARTIFACT DURABILITY` release follow-up.

## Canonical identity contract

- Version: `launch-exact-80-manifest-v1`
- Total: 80 (`LAW` 20, `HANDLING` 20, `SAFETY` 20, `SERVICE` 20)
- Excluded source question: `92477`
- Included replacement source question: `92582`
- Replacement master question: `cmtli1lsi0000s4romcyrkw3n`
- Semantic manifest checksum:
  `dd07ebcf5ab9d38c30438e125033e078cf165c53acfd4c27c38d24614d48ebbb`
- Current operator handoff artifact checksum:
  `fe45f65e10ae004c4a8ace3cc931cf47aaf9fdefe2e15e12b28836ecfb51847e`

The semantic checksum identifies the frozen canonical selection. The artifact
checksum identifies the deterministic Bundle v1 projection and excludes the
`exportedAt` metadata field. Neither checksum permits the source content itself
to be committed to Git.

## Contracts

- The manifest checksum must be
  `dd07ebcf5ab9d38c30438e125033e078cf165c53acfd4c27c38d24614d48ebbb`.
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

Validate an existing operator-managed bundle without writing to a database:

```text
npm run cbt:source-handoff:validate -- --bundle <ignored-json-path>
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
