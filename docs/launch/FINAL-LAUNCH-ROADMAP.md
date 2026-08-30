# Final Launch Roadmap — Gates 6-23

## Canonical scope

This document is the canonical definition of the Final Launch Roadmap from Gate 6 through Gate 23.
It must not be merged with or renumbered from S-stage, Track, Session, SEO, or other internal Gate numbering systems.
The canonical execution order is Gate 6 -> Gate 7 -> ... -> Gate 23.

External/Production evidence may be deferred when unavailable unless the evidence is an explicit hard dependency.
Production mutations, deploys, DNS/traffic changes, push/merge/main changes, tags/releases, paid external actions, and real-user mutations always require separate human approval.
Schema or migration changes require a proved need and separate approval.

## Gate 6 — Bounded Transactional Durability Importer

Purpose: implement the Blog Durability Bundle v1 bounded transactional importer.

Boundaries:
- local/test/disposable PostgreSQL only;
- Production DB writes prohibited;
- complete dry-run must run before writes;
- create only missing Category/Article rows;
- checksum/semantic-equal existing Article is NO_OP;
- any mismatch is CONFLICT / STOP;
- rollback, idempotency, transaction-local verification, and post-commit read-back are required;
- schema/migration changes are prohibited without a separately proved need and approval.

Gate 6 BUILD is authorized for local/test only.

## Gate 7 — Production Image URL Transformation Verification

Purpose: parameterize and verify image URL transformation for the Production canonical origin.
Keep this separate from Gate 6 transactional mechanics.
If the canonical Production domain or required external infrastructure is unavailable, code/static verification may complete while operational evidence is recorded as BLOCKED.
Production mutation is prohibited.

## Gate 8 — Blog 10 Final QA / Publication Readiness

Purpose: verify final Blog content and publication readiness for the 10 operating Articles in the durability/export set.
Baseline: 10 operating Articles, DRAFT 9, PUBLISHED 1, with one ARCHIVED Article excluded.
Verify article integrity, status consistency, content QA, CTA, image references, public visibility, publication readiness, and related regression coverage.
Reuse existing Blog Operations evidence and verify only the delta required by the current canonical HEAD.

## Gate 9 — Production Launch Preflight / Delta Audit

Purpose: perform a delta audit against the current canonical HEAD using prior Production Launch Closeout preflight/audit evidence as authoritative prior evidence.
Verify Gate 5+ code/config deltas, production-readiness impact, unresolved blockers, manual release items, security/config regressions, and launch-ledger consistency.
Do not repeat an unnecessary full audit.

## Gate 10 — Production ENV Readiness

Purpose: finalize and verify the Production runtime environment/configuration contract.
Verify required environment-variable names, secret-presence requirements, canonical site origin, provider configuration, fail-closed behavior, and example/documentation consistency.
Never record real secret values in the repository.
If Production credentials are unavailable, record operational evidence as BLOCKED.

## Gate 11 — Production DB / Migration Readiness

Purpose: verify Production PostgreSQL and migration readiness.
Verify the canonical Prisma schema, migration chain, migrate-deploy readiness, Production DB prerequisites, absence of destructive migration behavior, and data-initialization requirements.
Do not run actual Production migration without separate human approval.

## Gate 12 — Backup / PITR

Purpose: establish Backup/PITR readiness before Production migration/deploy.
Verify automated backup, retention, encryption, PITR support, recovery window, backup identification, and restore permission/readiness.
Hard dependency: NO VALID BACKUP = NO PRODUCTION MIGRATION / IMPORT.
If external infrastructure is unavailable, operational evidence is BLOCKED.

## Gate 13 — Restore Drill

Purpose: establish restore procedure and evidence proving that a backup can be recovered.
Verify an isolated restore target, restore procedure, recovered-state verification, recovery evidence, and rollback/recovery documentation.
Hard dependency: valid Gate 12 and Gate 13 proof is required before Gate 20 Production execution may be approved.
Production destructive operations are prohibited.

## Gate 14 — Durable Upload / Assets Readiness

Purpose: verify that Production Blog images/assets/uploads do not depend on ephemeral filesystem state.
Verify durable storage, persistence, public URL behavior, image references, restart/redeploy survival assumptions, and failure handling.
Production storage mutation requires separate human approval.

## Gate 15 — Logging / Monitoring / Alerts

Purpose: verify Production observability readiness.
Verify application logging, error visibility, monitoring, alert conditions, test-fire procedure, and privacy/PII leakage prevention.
If external alert test-fire needs credentials or creates external effects, record operational evidence as BLOCKED.

## Gate 16 — Staging Readiness

Purpose: verify that an isolated staging environment can validate the full stack before Production.
Verify staging app, DB, environment configuration, assets, migration state, test accounts, and isolation from Production.
If staging infrastructure does not exist, record operational evidence as BLOCKED.

## Gate 17 — Staging E2E

Purpose: run desktop/mobile and critical business-flow E2E against an actual staging deployment.
Coverage includes public pages, auth/admin, Jobs, Lease, Blog, Search, Lead, Company, monetization-related flows, and critical mobile/desktop paths.
If staging is unavailable, operational evidence is BLOCKED. Production must not substitute for staging E2E.

## Gate 18 — AI / Scheduler Readiness

Purpose: verify Production operational readiness for Blog AI generation and scheduler/automation.
Verify AI provider configuration, fail-closed behavior, DRAFT-only generation, QA gate, scheduler safety, duplicate-execution protection, and manual disable/control path.
Do not enable autonomous Production publishing without separate human approval.

## Gate 19 — Telegram Ops Readiness

Purpose: verify Production readiness of the Telegram-based operations/CS notification/outbox workflow.
Verify provider/config requirements, minimum-PII behavior, failure/retry handling, operator workflow, and prevention of unintended user messaging.
Actual external messaging follows the HUMAN/EXTERNAL boundary.

## Gate 20 — Production Deploy / Import Readiness

Purpose: establish final execution readiness immediately before Production deploy, migration, and durability import.
Gate 20 BUILD/readiness review may run, but actual Production deploy, Production DB migration, durability import, storage mutation, and traffic changes are human hard stops.
Gate 12 Backup/PITR and Gate 13 Restore proof are hard prerequisites for Production execution readiness PASS.
Deferred Production target evidence from Gate 5/7 must also be resolved before execution.

## Gate 21 — Production Smoke Verification

Purpose: validate critical flows after an actual Production deployment.
If Production has not been deployed with explicit human approval, status is `NOT EXECUTABLE / WAITING FOR HUMAN-APPROVED PRODUCTION DEPLOY`.
Do not assume or simulate a Production deployment.

## Gate 22 — SEO / Launch Policy Verification

Purpose: perform final public-launch SEO/discovery and launch-policy verification.
Verify sitemap, robots, canonical URLs, indexability, Published-vs-Draft visibility, Search Console submission readiness, policy/popups, monetization launch state, launch dates/config, and public-facing consistency.
Existing S19 SEO evidence may be reused, but its internal Gate numbering is distinct from Final Launch Gate 22.

## Gate 23 — Final GO / NO-GO / Public Switch

Purpose: aggregate all prior evidence and issue the final Production launch verdict: GO, CONDITIONAL GO, or NO-GO.
Review unresolved blockers, Production DB, backup/PITR, restore, durable uploads, monitoring/alerts, staging E2E, AI/scheduler, Telegram, Production smoke, SEO/policy, and operational/manual items.
Actual public traffic switch, DNS change, main merge, Production deploy, or other public-launch mutation requires separate human approval.

## Dependencies and continuation rules

Default dependency order is Gate 6 through Gate 23 sequentially.
Operational evidence that is unavailable because external infrastructure is missing may be marked BLOCKED while later static/build/readiness work continues, unless the evidence is a contractual hard dependency.

Explicit hard dependencies:
- Gate 12 + Gate 13 valid proof is required before Production migration/deploy/import execution can be approved at Gate 20.
- An actual staging environment is required to execute Gate 17 staging E2E.
- A human-approved Production deploy is required before Gate 21 Production smoke can execute.
- Any unresolved launch-critical blocker prevents a Gate 23 GO verdict.

## Evidence reuse policy

Reuse completed S1-S24, Track B, Blog Operations, SEO, and Production Launch preflight evidence when it remains applicable to the current canonical HEAD.
Prefer delta verification over rebuilding already-proven work.
A Gate with no code/documentation change may close as `NO CODE CHANGE / EVIDENCE-ONLY PASS`; do not create empty commits.
