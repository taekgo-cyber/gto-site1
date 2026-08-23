# SESSION 11 — LEAD MVP FINAL HANDOFF

- 작성 시각: 2026-08-22 (Asia/Seoul)
- baseline/current HEAD: `ac6635d5123ce22b3efccf7f205788a4dfe602fc`
- branch: `lead/session-11`
- Lead worktree: `C:/Users/taekg/Documents/Codex/gto-site1-lead-session11`
- main worktree: `C:/Users/taekg/gto-site1`
- main CBT worktree was not modified, cleaned, stashed, restored, committed, merged, rebased, cherry-picked, or pushed

## Release result

Session 11 Lead MVP implementation and QA are complete through Gate 7. Sol High decisions:

- Gate 0 GO
- Gate 1 GO
- Gate 2 GO
- Gate 3 GO
- Gate 4 GO
- Gate 5 GO
- Gate 6 GO
- Gate 7 GO — `SESSION 11 LEAD MVP PASSED`

Muse Spark 1.2 Free High was the required build model. The exact model ID recorded was `opencode/muse-spark-1.2-contributor-free`. Fresh Muse filesystem probes stale before tool execution in Gates 3–5; Sol High explicitly authorized bounded Codex alternative execution for those Gates. No data/quality opt-in was changed.

## Architecture

CandidateLead is an independent domain from LeasePost SEEK.

### Candidate owner flow

- User creates and saves one non-terminal CandidateLead as DRAFT.
- DRAFT may have `consentVersion = null` and `consentedAt = null`.
- DRAFT → ACTIVE requires server-side minimum validation, current policy consent, and server-recorded consent time.
- Lifecycle: DRAFT → ACTIVE; ACTIVE ↔ PAUSED; ACTIVE/PAUSED → CLOSED; ACTIVE/PAUSED → EXPIRED.
- CLOSED and EXPIRED are terminal and cannot be reactivated.
- Effective ACTIVE requires ACTIVE status, valid consent, and `expiresAt IS NULL OR expiresAt > now`.
- All owner reads/mutations derive the actor from the session and verify ownership server-side.

### Company discovery and matching

- Active User + COMPANY role + active Company + active CompanyMember are required.
- OWNER, MANAGER, and STAFF may discover.
- OWNER and MANAGER may create/cancel Match; STAFF cannot.
- Discovery supports bounded pagination and minimal region/vehicle/tonnage/experience/ownership/work-type/availability filters.
- List and detail use the pre-unlock DTO boundary.
- ACTIVE Match repeats are idempotent.
- CANCELLED Match reactivates the same companyId+leadId row.
- Different companies may independently match the same Lead.

### Contact unlock

- All create/consume paths use `unlockLeadContact`.
- Unlock requires active company authorization, OWNER/MANAGER, effective ACTIVE Lead, valid consent, and ACTIVE LeadMatch.
- `companyId + leadId` is unique and idempotent.
- Existing unlocks do not consume entitlement, cap, or create a new row.
- New unlocks use the existing Lead row `FOR UPDATE` transaction and configurable cap.
- `UnlockedContactDto` returns only `name` and `phone`.
- Email, address, userId, raw User, consent metadata, entitlement metadata, and snapshots are not returned/stored as contact snapshots.
- When a Lead is PAUSED, CLOSED, EXPIRED, or effectively expired, even a prior unlock cannot re-fetch PII.
- `LEAD_MAX_CONTACT_UNLOCKS_PER_LEAD` is required for the app unlock path; unset/invalid/negative values fail closed. No operational cap value was chosen in Session 11.

## Permission matrix

| Operation | USER | COMPANY STAFF | COMPANY MANAGER | COMPANY OWNER | ADMIN normal company route |
|---|---:|---:|---:|---:|---:|
| Candidate own Lead | own session only | own session only | own session only | own session only | no bypass |
| Company discovery | deny | allow | allow | allow | no role bypass |
| Match create/cancel | deny | deny | allow | allow | no role bypass |
| Contact unlock | deny | deny | allow | allow | no role bypass |

Every company operation also requires User ACTIVE, Company ACTIVE, and CompanyMember ACTIVE for the requested company context.

## Database and migration

Files:

- `prisma/schema.prisma`
- `prisma/migrations/20260822000000_add_candidate_lead_foundation/migration.sql`

Final migration review:

- CandidateLead consent columns are nullable to represent DRAFT without consent.
- ACTIVE invariant remains service-enforced.
- Partial unique index remains one non-terminal Lead per User:
  `candidate_leads_userId_non_terminal_unique` over DRAFT/ACTIVE/PAUSED.
- LeadMatch unique: `companyId + leadId`.
- LeadContactUnlock unique: `companyId + leadId`.
- Actor, company, lead, and audit indexes are present.
- Foreign keys use the approved cascade/set-null behavior.
- Migration SQL was reviewed but not applied to shared/main DB.
- No disposable/test DB was configured; real concurrent DB integration was not run. Transaction lock/unique behavior was reviewed and covered with bounded tests.

## Privacy and QA fixes in Gate 6

1. Medium: obvious phone/email in careerSummary could bypass unlock. Added minimal pattern validation and tests.
2. Medium: unlock Server Action could expose raw policy/authorization errors. Added safe redirect/error handling.
3. Low: unlock GET checked row existence before authorization. Reordered through authorized read service.
4. Medium: Match pre-check/create race. Added Lead row lock transaction and re-check.

No reproduced privacy, authorization, IDOR, or regression defect remains open within Session 11 scope.

## Verification

- Lead/security focused tests: 10 files / 57 tests PASS
- Full project tests: 73 files / 779 tests PASS
- Prisma validate: PASS
- Prisma generate: PASS
- Typecheck: PASS
- Changed-file ESLint: PASS
- Full lint: PASS with 0 errors and 13 existing warnings outside the Lead changes
- Full Next build: PASS
- `git diff --check`: PASS
- Shared/main DB write or migration apply: NONE
- CBT main unchanged: PASS

## Lead worktree state

Lead worktree remains intentionally uncommitted at baseline HEAD so no merge/push was performed. Expected Lead changes are present as modified/untracked files:

- `.env.example`
- `prisma/schema.prisma`
- `prisma/migrations/20260822000000_add_candidate_lead_foundation/migration.sql`
- `docs/lead/STATUS.md`
- this file
- `src/lib/leads/*`
- `src/app/mypage/lead/page.tsx`
- `src/app/company/leads/page.tsx`
- `src/app/api/company/leads/*`
- `src/components/leads/CandidateLeadForm.tsx`
- `src/__tests__/lead.*.test.ts`

No package.json, CBT source, or unrelated application file was changed by Session 11.

## Main CBT worktree state

Main HEAD remains `ac6635d5123ce22b3efccf7f205788a4dfe602fc`, branch `main`. Existing CBT dirty/tracked/untracked state remains untouched, including CBT runbook/package/tool/content changes and existing CBT logs/temp/evaluator files. It was not cleaned, stashed, restored, reset, committed, or otherwise altered.

## Deliberately deferred

- Real payment/PG
- Credit wallet/ledger
- Dynamic pricing
- Advertising quota
- SMS/push notification
- AI matching
- Admin dashboard expansion
- Production rate-limit infrastructure
- Advanced analytics
- Shared DB migration apply
- Merge/rebase/cherry-pick/push

## Next session instructions

1. Read this file and `docs/lead/STATUS.md` first.
2. Confirm Lead worktree status and main CBT status before any action.
3. Configure `LEAD_MAX_CONTACT_UNLOCKS_PER_LEAD` through an approved operational decision before enabling unlock in a real environment.
4. Do not apply the migration to shared/main DB without explicit approval.
5. Do not merge Lead into main while CBT work remains dirty without Sol High/user approval.
