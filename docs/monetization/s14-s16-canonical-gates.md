# Canonical S14-S16 Gate Correction

Date: 2026-08-24 (Asia/Seoul)

## Why this correction exists

The PASS-before-next-Gate operating rule was correct, but the recent session-number mapping drifted from the canonical roadmap.

Canonical roadmap:

- IG: latest CBT main + S11-S13 integration Gate
- S14: advertising/banner system
- S15: advertiser/product/contract management
- S16: Lead + advertising KPI / impression / click / conversion analytics

What drifted:

- `7bed996` implemented S14 advertising/banner operations **and** part of canonical S15 product/entitlement management.
- `282f4c0` then labeled existing Lead conversion analytics as S15, although that belongs inside canonical S16.
- Blog CMS was subsequently labeled S16 on a separate line, although Blog/Content Growth is not canonical S16 here and is protected as separate parallel S17/S19 work.

This document restores the canonical numbering. Existing completed code is reused; it is not reimplemented merely to match labels.

## Canonical S14 — Advertising / Banner System

Status: PASS at `7bed996`.

Acceptance already proven:

1. Managed advertisement products and placements exist.
2. Company campaign submission/update is authorization-gated.
3. Admin campaign approval/pause/cancel/expiry lifecycle exists.
4. Public placement rendering exposes only active/effective campaigns.
5. Unsafe URLs, IDOR, inactive company/product/placement and entitlement gaps fail closed.
6. Disposable PostgreSQL migration/E2E/concurrency and full regression passed.

No S14 rebuild is required.

## Canonical S15 — Advertiser / Product / Contract Management

Canonical domains:

- Advertiser = existing `Company`; no duplicate Advertiser model.
- Product catalog = existing `Product` + `ProductRecruitmentEntitlement`.
- Contract/entitlement instance = existing `CompanyRecruitmentEntitlement`; no duplicate Subscription/Contract table unless an actual invariant requires one.

### Gate 0 — S14 baseline audit

PASS when `7bed996` is clean and S14 evidence remains valid.

### Gate 1 — S15 contract lock

PASS when the above canonical-domain reuse is locked and real gaps are identified.

Known gaps after audit:

- Managed advertisement products can be synced but cannot be intentionally paused/resumed without being overwritten by the next sync.
- Company advertisement entitlement can be granted/renewed but has no explicit cancellation lifecycle while preserving the original contract expiry.

### Gate 2 — Product lifecycle

Implement admin-only managed product `ACTIVE`/`INACTIVE` state management.

- Locked code/price/tier/quota policy remains authoritative.
- Catalog sync creates missing products but must preserve an intentional existing product status.
- Inactive managed products cannot grant new contracts or approve/run campaigns.

### Gate 3 — Contract lifecycle

Implement explicit cancellation on `CompanyRecruitmentEntitlement` without rewriting original contract dates.

- `cancelledAt` is authoritative cancellation state.
- optional bounded `cancelReason` is audit metadata.
- cancellation requires ACTIVE ADMIN, is concurrency-safe/idempotent, and writes `AdminLog`.
- all active entitlement consumers (campaign authorization/approval, company entitlement display, quota tier resolution) must ignore cancelled rows.
- renewal remains append-only via a new grant/idempotency key.

### Gate 4 — Admin advertiser/product/contract operations UI

- product pause/resume controls.
- advertiser/contract history with active/expired/cancelled state.
- contract cancel action.
- existing Company approval and company identity remain authoritative advertiser management; no duplicate advertiser account system.

### Gate 5 — Security / regression

Focused tests must prove:

- ACTIVE ADMIN only for product/contract mutation.
- product sync does not undo intentional pause.
- cancelled contract cannot grant quota or authorize campaign creation/approval.
- repeated cancellation is safe and does not rewrite original expiry.
- unrelated Lead/credit/CBT contracts remain unchanged.

### Gate 6 — Disposable PostgreSQL

Required because S15 changes contract schema.

- all migrations from empty DB apply.
- cancellation columns/indexes exist.
- real grant -> cancel -> active-query denial -> renewal E2E passes.

### Gate 7 — S15 final audit

Full tests/typecheck/lint/build/Prisma/diff check PASS and meaningful local checkpoint.

## Canonical S16 — Lead + Advertising KPI / Impression / Click / Conversion

Existing Lead KPI from Session 12 is reused as the Lead half of S16.

### Gate 0 — S15 baseline

S15 must be PASS before S16 BUILD begins.

### Gate 1 — Analytics contract

Advertising funnel definition:

- Impression = an active public campaign was actually rendered in a client placement and the first-party impression endpoint accepted a deduped event.
- Click = user selected that campaign through a server-controlled click redirect; destination is loaded from authoritative campaign data, never trusted from query input.
- Conversion = a valid attributed ad click leads to activation of a CandidateLead on this site. Draft save alone is not a conversion.
- External destinations can produce impressions/clicks but cannot claim an on-site Lead conversion unless the user later returns with a still-valid first-party attribution cookie.
- attribution window: 30 days.
- analytics rows store no name/phone/email and no raw IP/user-agent.

### Gate 2 — Event schema/service foundation

Create append-only ad analytics events with campaign/company/placement snapshots, event type, occurrence time, optional opaque attribution token/source event, and dedupe key.

Required indexes support campaign/company/placement/date KPI aggregation.

### Gate 3 — Impression and click collection

- public ad client records deduped impressions.
- click route validates current public campaign, records click, sets HttpOnly first-party attribution cookie, then redirects to the authoritative safe destination.
- invalid/inactive/expired campaigns fail closed and do not record events.

### Gate 4 — Lead conversion attribution

- CandidateLead activation checks a valid recent click attribution server-side.
- one click can produce at most one conversion event.
- conversion recording failure must not corrupt an otherwise valid Lead state transition; transaction boundaries must be explicit and tested.
- successful conversion consumes/clears the attribution cookie at the action boundary.

### Gate 5 — KPI aggregation and UI

Admin analytics must present, for bounded date ranges:

- existing Lead KPI/funnel.
- ad impressions, clicks, CTR, conversions, click-to-conversion rate.
- per-campaign and per-advertiser/company breakdown.
- placement breakdown.
- denominators/sample counts visible; zero denominators return 0, never NaN/Infinity.

Company users may see only their own campaign KPI if a company-facing surface is added; cross-company disclosure is forbidden.

### Gate 6 — Security / privacy / analytics integrity

Focused tests cover event dedupe, auth, IDOR, attribution expiry, forged token rejection, no PII/raw fingerprint storage, zero-denominator math, date bounds, inactive campaign rejection and duplicate conversion prevention.

### Gate 7 — Disposable PostgreSQL + full release audit

Because S16 adds analytics schema:

- migrations from empty disposable PostgreSQL PASS.
- real impression -> click -> attributed Lead activation -> conversion -> KPI E2E PASS.
- full tests, typecheck, tracked-source lint, build, Prisma validate/generate and diff-check PASS.
- final local checkpoint only; no remote push unless explicitly requested.

## Protected parallel work

S17 and S19 are separate parallel tracks. This corrected S14-S16 lane must not modify their Blog/Content Growth/mobile-performance domains or their branches.
