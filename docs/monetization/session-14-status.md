# Session 14 Final Status — Advertisement Operations

- Date: 2026-08-24 (Asia/Seoul)
- Branch: `monetization/session-14`
- Start baseline: `2605de3`
- BUILD path: Web ChatGPT Sol High direct BUILD through ChatGPT To Codex MCP
- OpenCode Kimi/DeepSeek fallback: not used

## Gate result

- Gate 0 baseline/read-only audit: PASS
- Gate 1 domain/policy contract: PASS
- Gate 2 advertisement product identity/policy foundation: PASS
- Gate 3 company entitlement activation and authorization: PASS
- Gate 4 campaign lifecycle/admin-company operations/public exposure: PASS
- Gate 5 security/integration hardening: PASS
- Gate 6 disposable PostgreSQL migration/E2E/concurrency: PASS
- Gate 7 final regression/release audit: PASS

## Implemented contract

- Existing `Product`, `AdPlacement`, `AdCampaign`, `ProductRecruitmentEntitlement`, `CompanyRecruitmentEntitlement` reused; no duplicate ad/subscription/slot domain introduced.
- Managed advertisement product codes: `AD_GENERAL_7D`, `AD_PREMIUM_7D`, `AD_MAIN_7D`.
- Locked 7-day policy: GENERAL 40,000 KRW / Match 3, PREMIUM 80,000 / Match 5, MAIN 150,000 / Match 10.
- `Product.code` is nullable+unique for legacy compatibility; managed products require a code and fail closed on persisted policy drift.
- Company advertisement grants are append/audit-oriented and idempotent using nullable+unique `CompanyRecruitmentEntitlement.idempotencyKey`; historical rows remain compatible.
- ADMIN grant requires ACTIVE ADMIN and writes `AdminLog`; SYSTEM grant remains a separate internal boundary.
- Company campaign writes require ACTIVE `User.role=COMPANY`, ACTIVE Company, ACTIVE CompanyMember, and OWNER/MANAGER role. STAFF is read-only.
- Campaign submission is PENDING, must fit inside an active matching company entitlement and active placement, and validates region/time/safe URLs.
- ADMIN approval/pause/cancel transitions recheck authoritative state in a Serializable transaction. Concurrent same-campaign approval permits one success and one safe failure.
- Public exposure returns only ACTIVE, non-deleted, effective-window campaigns on an active placement with ACTIVE company/product. Unsafe legacy URLs are stripped.
- Minimal `/admin/ads` and `/company/ads` operations pages added. Homepage renders approved `HOME_TOP` promotions only.
- Order/OrderItem history, Credit ledger semantics, Lead contracts, CBT, live PG/payment, refund, AI, S17 and S19 remain outside scope.

## Verification

- Prisma validate: PASS
- Prisma generate: PASS
- S14 focused monetization tests: 23/23 PASS
- Full regression: 100 test files / 1,137 tests PASS
- Typecheck: PASS
- Changed-source ESLint: PASS
- Next production build: PASS (`/admin/ads`, `/company/ads` compiled)
- `git diff --check`: PASS (existing line-ending warning only)

## Disposable PostgreSQL Gate 6

- Isolated container: `gto_s14_gate6_postgres`
- Host port: `55433`
- Existing `gto_site_postgres` on `5432`: untouched
- 12/12 migrations applied; `prisma migrate status`: schema up to date
- `products.code`: nullable column present + unique index `products_code_key`
- `company_recruitment_entitlements.idempotencyKey`: nullable column present + unique index present
- Real service E2E: catalog 3, idempotent grant 1, campaign ACTIVE 1, public exposure PASS, IDOR denied, audit rows recorded
- Real concurrent approval race: exactly 1 fulfilled / 1 rejected — PASS
- Shared/main DB migration apply: NONE

## Sol High decision

`SESSION 14 PASS`.

Next: Session 15 minimum conversion analytics verification/closeout from this checkpoint. Existing Session 12 metrics implementation is expected to satisfy most or all S15 requirements; do not create an event-tracking schema unless a concrete gap is proven.
