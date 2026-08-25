# Session 21 Canonical Contract Lock

Date: 2026-08-25 (Asia/Seoul)

Status: **LOCKED — BUILD AUTHORIZED**

Branch: `codex/s21-unified-search`

Canonical checkpoint: `ff88dbd1d0b7cd20144fca1c493bbf2e00f12305`

Alignment merge: `bc812fd` (`merge: align S21 with canonical checkpoint`)

## Gate 0–2 audit

- The canonical checkpoint and the pre-existing S21 branch share code baseline
  `ae7b82f15049555c51f8282e9271efc38f7c17f7`.
- Canonical contains one documentation-only commit; S21 already contained two
  commits for the search contract and production preflight.
- Changed-file intersection from the common baseline: **0 files**.
- Canonical was aligned with a normal merge. No rebase, reset, force operation,
  source-branch rewrite or untracked-file mutation was performed.
- The same 11 pre-existing top-level untracked entries remain outside S21.
- Existing search contract regression: 1 file / 9 tests PASS before alignment.
- Existing S21 implementation at audit: validation, public source projections,
  deterministic ranking and tests only. There was no executing search DAL,
  `/search` route, Header entry, recommendation service or notification model.

## Product goal and launch priority

S21 makes already-public content easier to discover for the 10/1 free launch.
It does not create a new content source, paid feature, marketing profile or
vendor dependency. Existing domain authorization and public-visibility rules
remain authoritative.

## Gate 3–5 — Unified search contract

### Sources and privacy boundary

| Source | Required public predicate | Public context only |
| --- | --- | --- |
| Jobs | `OPEN`, undeleted, `publishedAt <= now` | company name, public regions |
| Lease | `PUBLISHED`, undeleted, `publishedAt <= now` | public taxonomy names |
| Blog | `PUBLISHED`, `publishedAt <= now` | active category name only |

CandidateLead, Company contact/private fields, CBT answers/explanations,
analytics, credit/payment data, admin data and unpublished content are excluded.

### Request and response

- `q`: NFKC and whitespace normalization, 2–100 characters.
- `domains`: `JOBS`, `LEASE`, `BLOG`; omitted means all. Repeated or unknown
  values fail validation.
- `page`: 1–5; `pageSize`: server-fixed 20.
- Each source returns at most 80 candidates plus one sentinel row. This bounds
  database and memory work to 243 fetched rows.
- `candidateLimited=true` means one or more sources had more candidates than
  collected. `totalMatches` then describes the ranked bounded result set, not
  an exact global count; the UI must say so.
- Public items are allow-listed to `id`, `domain`, `title`, `excerpt`, `href`,
  `context`, `publishedAt` and `matchedOn`.

Ranking is deterministic: title exact, title prefix, title contains, body
contains; ties use publication time descending, canonical domain order and ID.
No AI, user identity, click history or tracking signal participates.

The responsive `/search` page is request-time rendered, always `noindex,follow`,
and canonicalizes to `/search`. Invalid input renders a bounded validation state
without querying the database. Header gets a single search entry after focused
tests pass.

## Gate 6 — Recommendation contract

- Recommendations use only shared public region, vehicle-type, tonnage and Blog
  category signals already present in authoritative records.
- Jobs and Lease detail pages may show up to four public related items. Ranking
  uses matched-signal count, publication time, domain order and ID.
- Every item carries a short explanation such as “같은 지역” or “같은 톤수”.
- Blog keeps its existing effective-published category related-content flow.
- Candidate pools are bounded to 12 per queried domain and exclude the source
  item. Empty or non-public seeds return no recommendation.
- No personalization profile, behavioral tracking, vector database, LLM call or
  external search/recommendation service is allowed.

## Gate 7 — Notification decision and implementation contract

S21 implements an authenticated **in-app inbox only**.

| Type | Default | Consent rule |
| --- | --- | --- |
| `SYSTEM` | enabled | security/service operation notice; cannot be disabled |
| `ACTIVITY` | enabled | user may disable future activity notices |
| `CONTENT` | disabled | explicit opt-in required before creation |

- A notification is user-owned and contains only title, bounded body, optional
  internal path, delivery/read timestamps and expiry.
- Every producer supplies a non-secret idempotency key; `(userId, dedupeKey)` is
  unique. Retries return the existing row instead of duplicating delivery.
- Actions derive `userId` from the server session and update with both item ID
  and owner ID. Client-supplied ownership is never trusted.
- Inbox reads exclude expired rows and rows older than 90 days. Physical cleanup
  is an operations follow-up, not a request-time delete.
- S21 producers are deliberately small: signup welcome (`SYSTEM`) and company
  approval/rejection (`ACTIVITY`). No bulk fan-out or marketing campaign tool.
- Email, SMS, web push, mobile push and vendor delivery are deferred.

## Gate 8 — Cohesive UX contract

- Reuse existing Container/Card/Button/Input tokens and Track B focus/touch
  rules; no broad redesign.
- Search has labelled controls, keyboard submit, mobile wrapping, explicit idle,
  validation, empty, bounded-count and pagination states.
- Authenticated Header shows an inbox entry and bounded unread badge.
- Inbox provides mark-one, mark-all and preference controls with server-side
  authorization.
- New private routes are `noindex`; no PII enters search, recommendations,
  analytics or notification bodies.

## Verification gates

1. Prisma format/validate/generate and migration static audit.
2. Search, recommendation and notification focused tests.
3. TypeScript and tracked-project ESLint.
4. Full Vitest regression.
5. Next.js production build and route-manifest audit.
6. Available localhost smoke, mobile overflow/accessibility and security/privacy
   checks. DB-dependent flows are reported as environment-blocked if no local
   disposable PostgreSQL is available; they are never relabelled PASS.
7. Final diff/untracked preservation audit and one S21 checkpoint commit.

## Explicitly deferred

External search engines, vector databases, AI matching/personalization,
marketing tracking, email/SMS/push vendors, broad design rewrite, public Company
directory, payment work, production migration/deploy and production provider
calls are outside S21.
