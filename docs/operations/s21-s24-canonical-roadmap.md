# S21-S24 Canonical Roadmap

Date: 2026-08-25

Baseline: POST-S20 master integration on `integration/post-s20-master`

This roadmap is a scope contract, not authorization to begin the next BUILD.

## Current capability audit

Already complete and not to be rebuilt:

- public Jobs and Lease list/detail/filter/SEO routes
- CBT practice, exam, grading and per-user history
- Candidate Lead owner, company discovery/match/unlock and operations flows
- Company application and ADMIN approval
- Ads catalog, entitlement, campaign operations and privacy-safe analytics
- Credit/quota ledgers and provider-neutral payment type boundary
- Blog CMS, AI draft, SEO discovery/internal links and PostgreSQL automation queue
- mobile/accessibility/error/404/health/readiness/security/operations baseline

Material gaps confirmed in the current code:

- no unified cross-domain search API or result page
- no user preference/subscription model, personalized recommendation service or notification inbox/delivery system
- no public Company directory/profile route
- no company member invitation/role/ownership management workflow
- no real payment provider, checkout, webhook endpoint, refund orchestration or settlement/reconciliation
- no production scheduler, durable upload storage, alert destination or release deployment evidence

## S21 - Search, recommendations, notifications and cohesive UX

Goal: make existing content discoverable without duplicating domain logic.

Gate order:

1. Unified search contract
   - Search only authoritative public DAL projections from Jobs, Lease and effective-published Blog.
   - Define bounded query validation, pagination, ranking and noindex/canonical behavior.
   - Do not expose CandidateLead, private Company/contact, CBT answers, analytics or credit data.
2. Unified search UI
   - Add one responsive `/search` result surface and Header entry only after the contract is tested.
   - Reuse existing cards/tokens and preserve Track B mobile/keyboard requirements.
3. Recommendation contract
   - Begin with deterministic, explainable related-content ranking based on public taxonomy/content signals.
   - Reuse Blog discovery patterns; do not introduce AI personalization or tracking profiles in the first gate.
4. Notification decision gate
   - First define event types, consent/preferences, delivery state, retention and idempotency.
   - Implement an in-app inbox before email/SMS/push vendor integration.
5. S21 E2E and privacy gate
   - Search/recommendation relevance fixtures, notification authorization, mobile overflow, accessibility and no-PII analytics.

Explicitly deferred from S21: external search engine, vector DB, AI matching, SMS/push vendor, marketing tracking and broad design rewrite.

## S22 - Company pages, operational data and admin automation

Goal: close the Company/product operations gap using existing Company, Lead, Ads and Blog foundations.

Gate order:

1. Public Company profile/directory contract with an explicit allowlist of fields.
2. Company profile ownership/edit workflow with active membership and audit checks.
3. Member invitation and OWNER/MANAGER/STAFF lifecycle only after role-transfer and last-owner invariants are locked.
4. Consolidated company operations views using existing Lead/Ads/contract data without leaking PII or ledger internals.
5. ADMIN operational queues and audit views; reuse the PostgreSQL durable-job pattern only where a real durable job is needed.
6. Retention/export/privacy review and browser E2E.

Do not create a second Company entity, second analytics event store or generic queue framework without a proven consumer.

## S23 - Real PG, webhooks, cancellation/refund and settlement

Goal: turn the existing provider-neutral payment boundary and Order/Credit foundations into an auditable production payment flow.

Prerequisite decision gate requiring explicit user approval:

- PG provider and contract
- final catalog prices/tax/receipt policy
- free quota and credit conversion rules
- cancellation, full/partial refund and expiry policy
- settlement/reconciliation owner and retention policy
- staging/production secret and webhook endpoint strategy

Build order after approval:

1. provider adapter and checkout intent; never trust client price/product data
2. signed webhook verification, event persistence and exactly-once processing
3. transactional Order/Payment-to-entitlement or credit grant orchestration
4. cancellation/refund state machine and idempotent replay
5. reconciliation/settlement reports and mismatch alerts
6. sandbox provider E2E, failure injection and security review

No live charge, production secret or production webhook may be used before a separate launch approval.

## S24 - Final Release Candidate, QA and Launch Gate

Goal: produce release evidence rather than add features.

Required release gates:

- freeze scope and dependency/schema/migration audit
- fresh zero-to-latest migration and staging restore rehearsal
- full automated regression plus desktop/mobile browser matrix
- auth/authorization/privacy/payment/webhook/cron abuse tests
- performance budgets and accessibility audit
- durable upload storage verification
- production environment/secret inventory without value exposure
- scheduler, backup/PITR and health/readiness alert test-fire
- rollback and incident runbooks
- staging deploy/smoke, then explicit production GO/NO-GO approval

Production deploy, production migration and real payment/provider operations remain separate user approval gates.

## Recommended immediate next session

`S21 Gate 0-1 - Unified Search Audit and Contract Lock`

The session should be read-heavy and schema-free by default: inventory current Jobs/Lease/Blog public DAL predicates, define the result DTO/ranking/pagination/privacy contract, write focused contract tests and stop for review before changing Header or adding notification/recommendation persistence.
