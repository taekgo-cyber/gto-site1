# S23 Production Launch / Ops / Monetization Activation Plan

Date: 2026-08-25

Baseline: `1ca4776fa9f2f00c0e5562dee7d4a954a02e5135` (S22 COMPLETE / PASS)

Branch: `codex/s23-production-launch-ops`

## 1. Baseline

- S22 is a direct descendant of the S21 checkpoint and is the S23 code baseline.
- The original worktree had no tracked or staged changes. Nine pre-existing untracked
  artifacts are preserved and excluded from S23.
- No production deploy, production database operation, remote push, merge, credential
  change, customer notification, or charge is authorized in S23.

## 2. Existing capabilities

- Auth/session/role and owner/company/admin boundaries
- Public Jobs, Lease, Blog, CBT, Search, recommendations and Company routes
- Candidate Lead lifecycle, discovery, match, quota/credit-backed unlock and PII boundary
- Advertisement catalog, entitlements, campaign lifecycle and privacy-safe analytics
- Company operations, public allowlist, suspension audit, Support/CS and Telegram outbox
- Admin Lead KPI, advertisement operations, Company/Ticket/Ops queues
- Health/readiness routes, production preflight, migration/backup/observability runbooks
- Error/not-found UI, security headers, rate limits, idempotency and notification isolation

## 3. Actual launch gaps

1. The four launch phases have no single KST-aware, validated effective-policy contract.
2. Public/maintenance availability has no operator-controlled fail-safe switch.
3. The existing Admin Ops page does not aggregate the launch-day Lead, unlock, ad,
   notification and publication signals needed for a daily operational decision.
4. Provider/action failure logs are inconsistent and need a bounded, PII-safe shape.
5. Production preflight does not validate the S23 launch schedule/availability contract.
6. S23 needs consolidated regression evidence and an explicit manual-production checklist.

## 4. Out of scope

- Real PG/checkout/webhook/refund/settlement and any live charge
- New price, discount, credit conversion or quota numbers
- Production deployment/migration/data mutation, DNS, credentials or real notifications
- New analytics store, BI platform, A/B testing, CRM, AI feature or redesign
- Durable-storage provider implementation; the existing external release condition remains

## 5. Required code changes

- Add a server-only launch policy that validates ordered `+09:00` boundaries and resolves
  PRELAUNCH/FREE/PRENOTICE/DISCOUNTED/STANDARD phases without changing catalog prices.
- Add a `PUBLIC`/`MAINTENANCE` availability switch with health/readiness/admin exemptions.
- Extend the existing Admin Ops overview with bounded daily operational counts and links.
- Add a structured operational error logger that records only stable categories and bounded IDs.
- Extend production preflight and `.env.example` for the new configuration contract.

## 6. Required operational documentation

- Final gate-by-gate status and exact command evidence in `docs/launch/S23-STATUS.md`.
- Update the production environment contract with phase and availability variables.
- Retain existing migration, backup/recovery, observability and Telegram runbooks by reference.

## 7. Required tests

- Phase resolution, exact KST boundaries, invalid/misordered configuration and enforcement
- Maintenance/public routing and existing `/mypage` authentication behavior
- Admin operational count query boundaries and no-PII projections
- Structured log redaction/category behavior
- Existing S21/S22 focused regressions plus the full suite and production build

## 8. Migration impact

- Schema change: none planned.
- Migration: none planned.
- Prisma validate/generate and migration-chain audit are still mandatory.
- No production database operation is permitted.

## 9. User decision required

`NONE`

Existing price/quota contracts remain unchanged. The discounted phase is represented as an
activation state only; it does not invent a discount rate. Real payment activation remains a
future explicit business/provider approval gate.

## 10. Gate acceptance criteria

| Gate | Acceptance |
| --- | --- |
| 0 | S22 baseline, branch isolation and dirty/untracked preservation proven |
| 1 | Existing inventory and only the six actual launch gaps above are locked |
| 2 | KST phase/availability policy, invalid-config behavior and server enforcement pass |
| 3 | Existing quota/credit/entitlement/idempotency contracts regress cleanly; no charging added |
| 4 | Admin can answer the S23 daily operations questions from one overview |
| 5 | Critical failures emit bounded category/operation/actor/time/identifier logs without PII |
| 6 | Schema/migration chain and backup/restore runbooks pass without production mutation |
| 7 | Authorization, PII, abuse, redirect, idempotency and notification isolation regress cleanly |
| 8 | Automated critical contracts pass; production-only/manual journeys are explicitly separated |
| 9 | Focused/full tests, typecheck, lint, Prisma, build and diff checks pass |
| 10 | Scope/privacy/pricing review, status document and final checkpoint are complete |
