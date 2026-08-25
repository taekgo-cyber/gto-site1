# Session 21 Canonical Gate

Date: 2026-08-25 (Asia/Seoul)

Status: **COMPLETE / PASS**

Branch: `codex/s21-unified-search`

Canonical input: `ff88dbd1d0b7cd20144fca1c493bbf2e00f12305`

Canonical alignment merge: `bc812fd`

Final checkpoint: the commit containing this document.

## Outcome

S21 delivers launch-bounded search, recommendations, notifications and cohesive
UX. It adds no external provider, AI personalization, vector database,
behavioral profile, marketing fan-out or new dependency.

## Gate results

| Gate | Scope | Result |
| --- | --- | --- |
| 0 | repository/worktree/untracked preflight | PASS |
| 1 | canonical vs existing S21 commit/diff/test audit | PASS |
| 2 | normal canonical alignment and Contract Lock | PASS |
| 3 | bounded authoritative public search DAL | PASS |
| 4 | deterministic global ranking and pagination | PASS |
| 5 | responsive `/search`, noindex/canonical and Header entry | PASS |
| 6 | explainable public taxonomy recommendations | PASS |
| 7 | notification consent/state/idempotency/schema | PASS |
| 8 | authenticated inbox, preferences, unread UX and producers | PASS |
| 9 | Prisma schema/client/migration integrity | PASS |
| 10 | TypeScript and tracked-project ESLint | PASS |
| 11 | focused and full automated regression | PASS |
| 12 | Next.js production build and route manifest | PASS |
| 13 | DB-backed HTTP and desktop/mobile browser smoke | PASS |
| 14 | security/privacy/retention review | PASS |
| 15 | documentation and final diff audit | PASS |
| 16 | S21 canonical checkpoint | PASS |

## Gate 0–2 Git audit

- S21 and canonical shared code baseline
  `ae7b82f15049555c51f8282e9271efc38f7c17f7`.
- Canonical was one documentation commit; S21 had two commits:
  `a0a36fc` search Contract Lock and `9c1fe65` production preflight.
- Changed-file intersection from the common baseline was zero.
- The existing search contract test passed 9/9 before alignment.
- Canonical was merged normally. No rebase, reset, force operation, untracked
  mutation or source-branch rewrite occurred.
- All 11 pre-existing top-level untracked entries remained present and excluded
  from the S21 checkpoint.

## Implementation

### Search

- Jobs: `OPEN`, undeleted and effectively published.
- Lease: `PUBLISHED`, undeleted and effectively published.
- Blog: `PUBLISHED` and effectively published; inactive category context is
  hidden.
- NFKC query validation, domain allowlist, pages 1–5 and fixed page size 20.
- 80 candidates plus one sentinel per source; at most 243 fetched rows.
- Public DTO allowlist and deterministic title/body quality ranking.
- Request-time `/search` is always `noindex,follow` with canonical
  `/search`.

### Recommendations

- Public Jobs and Lease detail recommendations use shared region, vehicle type
  and tonnage only.
- Candidate pools are bounded to 12 per domain and final output to four.
- Results explain each match; unexplained or non-public candidates are removed.
- Existing effective-published Blog category recommendations remain canonical.

### Notifications

- Added additive `NotificationType`, `NotificationPreference` and
  `InAppNotification` schema plus migration
  `20260825220000_add_in_app_notifications`.
- `SYSTEM` is required, `ACTIVITY` defaults on and `CONTENT` defaults off.
- In-app only; internal href validation, bounded text, user-scoped unique
  idempotency keys, delivery/read/expiry state and a 90-day visible-retention
  window.
- Every mutation derives the owner from the server session and includes
  `userId` in the database predicate.
- Producers are limited to signup welcome and company approval/rejection.
- The authenticated `/notifications` page is noindex and provides read-one,
  read-all and preference controls. Header unread display is capped at `99+`.

## Verification evidence

- Focused S21/affected Company regression: 5 files / 76 tests PASS.
- Full Vitest: 117 files / 1,222 tests PASS.
- Next.js route types: PASS.
- TypeScript `tsc --noEmit`: PASS.
- Targeted S21 ESLint: PASS.
- Canonical tracked-project ESLint: 0 errors / 14 existing warnings.
- Raw `npm run lint`: the same two errors from preserved untracked
  `check-env.js` and `check-env-pattern.js`; no tracked-source error.
- Prisma format was run, then unrelated schema alignment churn was removed.
- Prisma validate and Client generate: PASS, Prisma 7.9.1.
- Migration chain: 19 unique directories; S21 migration is additive and its
  destructive SQL scan is empty.
- Local PostgreSQL target was verified as `localhost:5432/gto_site`.
- The four pending canonical Blog migrations and the S21 migration were applied
  locally with `prisma migrate dev`; final status is up to date.
- Next.js 16.3.0 Turbopack production build: PASS; route manifest includes
  `/search` and `/notifications`.
- Production preflight on the local non-production environment: expected NO-GO,
  10 failed configuration checks and 3 manual gates. No secret value was
  printed. This is an external launch-operations gate, not an S21 code gate.

## Browser and DB smoke

Production server smoke ran on localhost only.

- Public `/search?q=지입`: 200 with three seeded public Lease results.
- Search DOM: labelled searchbox/combobox/button and semantic result region.
- Search metadata: `noindex, follow`, canonical `/search`.
- Mobile viewport 390×844: document width 375, no horizontal overflow; search
  input and submit control both 44px.
- Public Lease detail: related recommendations rendered with explainable region,
  vehicle and tonnage reasons; no horizontal overflow.
- Browser console: zero errors/warnings in audited search/recommendation flows.
- Unauthenticated `/notifications`: redirected to `/login`.
- Bounded local fixture smoke: authenticated inbox HTTP 200, idempotent retry,
  default content opt-out, explicit opt-in delivery, cross-user read denial and
  read/unread transition all PASS.
- The two synthetic smoke users were removed by exact ID in `finally`; their
  notifications/preferences cascaded. No existing user or content row changed.

## Security and privacy

- Search and recommendations use public source predicates again at their DAL
  boundaries and never select contact, CandidateLead, CBT answer, analytics,
  credit/payment or admin data.
- Search excerpts are bounded; raw full bodies do not cross the DTO boundary.
- Recommendation reasons expose taxonomy labels only.
- Notification links must be root-relative and cannot be protocol-relative.
- CONTENT delivery is suppressed before opt-in; no email/SMS/push is sent.
- Notification read writes are owner-scoped and idempotency is enforced by a
  database unique constraint.
- Inbox reads hide expired and older-than-90-day rows. Physical retention cleanup
  remains an operations task and never runs in a user request.
- Company rejection reason is not copied into the notification body.

## Deferred and external follow-up

- Production migration/deploy, secrets, scheduler, provider calls and remote
  push remain separate approvals.
- S24 must repeat zero-to-latest migration and authenticated browser E2E in a
  disposable/staging restore environment.
- A scheduled physical purge for expired/older-than-90-day in-app notifications
  should be connected before the retention volume requires it.
- Email, SMS, push, marketing subscriptions, bulk fan-out, external search,
  vector DB and AI personalization remain explicitly deferred.
