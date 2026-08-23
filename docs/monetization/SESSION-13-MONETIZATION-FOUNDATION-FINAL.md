# SESSION 13 — MONETIZATION FOUNDATION FINAL HANDOFF

## Purpose

Session 13 adds the bounded monetization foundation for the existing Session 11 Lead MVP and Session 12 Production Readiness work. The release scope is Company-owned credits, operation-specific quota accounting, Lead Match/Contact Unlock integration, idempotency, authorization, privacy, and a provider-neutral payment boundary.

No live payment provider, checkout UI, shared/main database, CBT change, merge, rebase, cherry-pick, push, or new pricing policy was introduced by the implementation scope.

## Final Gate results

| Gate | Final result | Scope/result |
|---|---|---|
| Gate 0 | GO | Baseline and production-readiness audit |
| Gate 1 | GO | Domain, product, Company/Lead policy contracts |
| Gate 2 | CONDITIONAL GO → PASS after Gate 6 evidence | Lead foundation; real DB verification deferred until Gate 6 |
| Gate 3 | GO | Credit ledger foundation |
| Gate 3.1 | PASS | Credit semantics and bounded corrections |
| Gate 4 | PASS | Product, CreditPackage, recruitment entitlement, and quota foundation |
| Gate 4.1 | PASS | DB-backed weekly quota usage service |
| Gate 5 | PASS | Lead monetization transaction boundary and generic Company credit consumption |
| Gate 6 | PASS | Real disposable PostgreSQL migration, schema, concurrency, and E2E verification |
| Gate 7 | PASS | Final release audit |

Sol High final decision: `SESSION 13 GATE 7 PASS` / `SESSION 13 MONETIZATION FOUNDATION PASSED`.

## Company-owned billing architecture

`Company` is the economic owner of credit and quota state. `actorUserId` is stored separately as actor/audit provenance and is never conflated with `companyId`.

- `CreditAccount`: one Company-owned balance projection.
- `CreditGrant`: appendable grant/batch rows with source, reference, allowance provenance, remaining amount, and nullable expiry.
- `CreditTransaction`: append-only ledger rows with signed `amountDelta`, `balanceAfter`, source/reference provenance, actor provenance, and Company-scoped idempotency.
- `CompanyQuotaUsage`: weekly aggregate for operation-specific free quota.
- `CompanyQuotaConsumption`: append-only quota consumption/idempotency record.
- `CreditPackage` and recruitment entitlements remain separate catalog/entitlement domains from legacy advertising Products and Orders.

KRW and Credit are separate integer concepts and branded types. No implicit monetary conversion is implemented in the payment boundary.

## Credit and quota invariants

- Ledger is the source of truth; balance is a projection checked against ledger operations.
- Direct arbitrary balance mutation is not exposed by the credit DAL/service contract.
- Credit consumption locks the Company account, selects eligible grants, prevents negative balance, decrements grants atomically, updates the projection conditionally, and appends one `CONSUME` row.
- Grants and operations carry source/reference/actor provenance.
- `companyId + idempotencyKey` is unique for credit transactions and quota consumptions.
- Replaying the same logical operation is `ALREADY_CONSUMED`; a same-key different-operation collision is a safe conflict.
- Free quota is attempted first. If quota is unavailable, the authoritative Lead transaction consumes generic Company credit.
- `MATCH` and `CONTACT_UNLOCK` allowance types remain distinct even when paid credit is generic Company balance.
- Match cost and Contact Unlock cost are represented by the locked Session 13 policy; no new pricing policy was introduced in Gate 7.
- Authoritative quota/credit consumption and Lead Match/Unlock creation occur in one transaction boundary so failure rolls back the domain write and economic write together.

Refund, reversal, expiration, and administrative adjustment are represented by append-only transaction types/contracts and are not implemented as mutable ledger rewrites. Final cash-refund and partial-refund business policy remains deferred.

## Lead monetization integration

The existing `LeadEntitlementAdapter` boundary remains available for the FREE_MVP/test path. Production Lead Match/Unlock calls use the DB-backed quota and generic Company credit path.

Match and Unlock require:

- ACTIVE User with COMPANY role;
- ACTIVE Company and ACTIVE CompanyMember;
- OWNER or MANAGER operation permission;
- effective ACTIVE Lead with valid consent and non-expired state;
- ACTIVE LeadMatch before Contact Unlock;
- unique `companyId + leadId` domain rows;
- idempotent replay without a second quota/credit consumption.

Terminated, paused, closed, or expired Leads cannot re-fetch contact PII, including through an existing unlock row.

## Permission matrix

| Operation | USER | COMPANY STAFF | COMPANY MANAGER | COMPANY OWNER |
|---|---:|---:|---:|---:|
| Candidate own Lead | own session only | own session only | own session only | own session only |
| Company discovery | deny | allow | allow | allow |
| Match create/cancel | deny | deny | allow | allow |
| Contact Unlock | deny | deny | allow | allow |

Every company-scoped request revalidates actor, selected Company, Company status, CompanyMember status, and role server-side. STAFF cannot perform monetized Match/Unlock operations.

## Payment boundary

`PaymentProviderBoundary` is provider-neutral and shape-only. It separates KRW amount from Credit amount and defines create/confirm/webhook/cancel/refund method contracts with idempotency fields.

No provider credentials, live PG calls, webhook handler, checkout UI, or payment-to-credit grant orchestration is included. Exactly-once payment callback handling and final Payment 1 → Credit grant implementation are deferred to the payment integration gate.

## Privacy and tenant isolation

- Pre-unlock DTOs exclude `userId`, name, phone, email, address, and internal audit identifiers.
- Unlocked contact returns only candidate name and phone.
- Company operations and KPI paths use bounded, privacy-safe DTOs and aggregate/selective queries.
- Password hashes, sessions, tokens, raw DB errors, `DATABASE_URL`, and stack details are not user-facing.
- Cross-company Company/credit/quota access is blocked by server-side authorization and Company-scoped keys.

## Gate 6 real PostgreSQL evidence

Disposable environment:

- Container: `gto_session13_gate6_pg_98a32994c974`
- Image: `postgres:16-alpine`
- Host binding: `127.0.0.1:55432`
- Database/user: `gate6_db` / `gate6_user`
- Existing `gto_site_postgres` on `5432` was not modified.

Results:

- 10 migrations applied successfully.
- Schema is up to date.
- 43 public tables present.
- FK, index, unique, and partial-unique checks passed.
- CandidateLead non-terminal concurrency passed.
- Duplicate Match concurrency passed.
- Duplicate Unlock/idempotency concurrency passed.
- Unlock cap last-slot concurrency passed.
- Company self-application SERIALIZABLE concurrency passed.
- Concurrent Admin approve/reject transition passed.
- Credit/quota/idempotency/rollback tests passed.
- Real Prisma service E2E passed.

The real PrismaPg `DriverAdapterError: TransactionWriteConflict` observed during the Company SERIALIZABLE race is safely mapped to `DUPLICATE_COMPANY_APPLICATION` by the bounded Gate 6 correction in `src/lib/company/service.ts`, with focused regression coverage.

## Final verification

- `npm test`: 82 files / 947 tests PASS
- `npm run typecheck`: PASS
- `npm run lint`: 0 errors / 13 pre-existing warnings
- `npx prisma validate`: PASS
- `npx prisma generate`: PASS
- `npm run build`: PASS
- `git diff --check`: PASS

## Git and worktree handoff

- Worktree: `C:/Users/taekg/Documents/Codex/gto-site1-monetization-session13`
- Branch: `monetization/session-13`
- Base/current audit HEAD before final checkpoint commit: `505d836`
- Final checkpoint commit is created after this document and the final verification.
- No schema/migration/package/lockfile change is part of the final checkpoint.
- `C:/Users/taekg/gto-site1` CBT main worktree remains untouched.
- Shared/main PostgreSQL and `gto_site_postgres:5432` remain untouched.
- Integration with main is a separate Integration Gate; this branch is not merged into main by Session 13.

## Deferred follow-up

The following are intentionally subsequent work, not Session 13 release defects:

- actual PG provider selection and live credentials/charges;
- final price catalog and final free-quota numbers;
- final KRW-to-Credit conversion ratio;
- cash-credit expiry policy;
- partial refund and reversal business policy;
- payment webhook exactly-once implementation and Payment-to-Credit grant orchestration;
- advanced billing/member roles;
- notifications;
- AI matching;
- production rate-limit hardening;
- separate main integration/merge/push gate.

## Final status

`SESSION 13 MONETIZATION FOUNDATION PASSED`.

This document is the final Session 13 handoff. No new development follows this checkpoint until a separately approved Integration or payment gate.
