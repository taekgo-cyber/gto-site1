# Session 14 Plan — Advertisement Operations

- Date: 2026-08-23 (Asia/Seoul)
- Branch: `monetization/session-14`
- Baseline: `8de533e` (CBT final + Session 11-13 integrated main)
- Orchestrator: Web ChatGPT Sol High
- BUILD delegate: OpenCode Muse 1.2

## Objective

Close the remaining monetization operations path using the existing `Product`, `AdPlacement`, `AdCampaign`, `Order`, `ProductRecruitmentEntitlement`, and `CompanyRecruitmentEntitlement` foundations. S14 is not a live-payment release.

## Existing foundation to reuse

- Advertisement catalog: `Product`
- Placement/slot equivalent: `AdPlacement`
- Scheduled exposure instance: `AdCampaign`
- Purchase-history foundation: `Order` / `OrderItem`
- Recruitment tier/quota catalog link: `ProductRecruitmentEntitlement`
- Company-owned active entitlement: `CompanyRecruitmentEntitlement`
- Credit/quota/Lead monetization: Session 13 complete

Do not introduce duplicate `ad_products`, `subscriptions`, or `ad_slots` models merely to match roadmap naming when the existing models already provide the same bounded responsibility.

## Locked S14 scope

1. Stable advertisement product identity/policy
   - Give advertisement products a stable machine-readable identity if current schema cannot safely support policy lookup.
   - Keep GENERAL / PREMIUM / MAIN recruitment tiers and current reference prices as the policy source.
   - One active tier is resolved by highest effective tier; no stacking.

2. Product entitlement activation boundary
   - Admin/system grant path can activate a company entitlement from an advertisement product without requiring live PG.
   - Grant must be auditable/idempotent and must not mutate historical Order records.
   - Payment provider callbacks remain deferred.

3. Advertisement campaign authorization
   - Company OWNER/MANAGER may create/update a campaign only for its own active entitlement and an allowed active placement.
   - STAFF is read-only unless an already-approved company role policy explicitly allows more.
   - Enforce company isolation, effective time window, active placement, safe URLs, and campaign lifecycle.

4. Admin operations
   - Minimal admin pages/actions for product catalog, placements, campaign approval/pause/expiry, and company entitlement inspection/grant.
   - Every privileged mutation rechecks ADMIN authorization server-side.
   - No broad dashboard redesign.

5. Public exposure
   - Server-side query for active campaigns by placement/region/time.
   - Render bounded banner/company promotion slots on the relevant existing pages without changing unrelated layout architecture.
   - Expired/paused/pending/deleted campaigns never render.

6. Verification
   - Focused authorization/policy/idempotency/time-window tests.
   - Prisma validate/generate, full Vitest, typecheck, tracked-source lint, Next build, git diff --check.
   - If schema changes, generate a new migration but do not apply to shared/main DB; use disposable PostgreSQL only for final migration/concurrency verification.

## Explicitly deferred

- Live PG/provider selection and credentials
- Actual card/bank charging or webhook processing
- Refund/partial refund/cash-credit expiry policy
- Automatic invoice/tax integration
- AI matching and notification expansion
- S15 conversion analytics and later roadmap work

## Build guardrails

- Muse must not alter CBT behavior or data tooling.
- Muse must not redesign Lead contracts or credit ledger semantics.
- Muse must not create duplicate monetization domains when existing models can be extended safely.
- PLAN-breaking schema/interface changes require Sol High review before implementation.
- Simple compile/test failures may be fixed and reverified by Muse within the approved scope.

## Gate sequence

- Gate 0: baseline/read-only audit — PASS (integrated baseline verified)
- Gate 1: domain/policy contract — PASS by Sol High with this document
- Gate 2: bounded schema/service foundation, only if required
- Gate 3: admin/company authorization and entitlement activation
- Gate 4: campaign lifecycle + public placement rendering
- Gate 5: privacy/security/integration QA
- Gate 6: disposable PostgreSQL migration/E2E if schema changed
- Gate 7: final release audit and integration checkpoint

## Sol High decision

`S14 GATE 1 GO / GATE 2 BUILD AUTHORIZED` within the locked scope above.
