# Session 20 Track A — Content and SEO Automation Operations

## Result

Date: 2026-08-24

Branch: `track-a/blog-ai-content`

Baseline: `cca5212` (`feat(blog): complete session 19 SEO discovery`)

Protected scope: Track B worktree/branch, CBT behavior/data/tooling, Lead/Ads/Credit contracts, production DB, production deployment

S20 is complete locally. The S18 AI Draft pipeline and S19 discovery contract now have a PostgreSQL-backed, scheduler-neutral operations layer. Automation can create only an AI `DRAFT`; publication still requires an active administrator to review and explicitly publish now or schedule a future publication time.

## Locked contract

- No Redis, external queue, new package, paid scheduler, or provider-specific infrastructure was added.
- `BlogContentJob` is the durable queue with unique idempotency and normalized topic keys.
- Atomic `QUEUED -> RUNNING` guarded updates prevent concurrent claims.
- `BlogContentJobAttempt` records bounded attempts, safe failure codes, runner provenance, and stale-claim recovery.
- A unique `BlogArticle.automationJobId` link closes the crash window: replay finds the already-created DRAFT before any second provider call.
- Provider-cost attempts are limited by a KST daily budget and a hard batch maximum of five; manual retries can raise the per-job cap only to five.
- DB-backed pause, cancellation request, bounded exponential retry, permanent/retryable failure classification, and recent-job admin visibility are included.
- Cron GET/POST at `/api/cron/blog-content` fails closed unless `BLOG_AUTOMATION_CRON_SECRET` is configured with at least 32 characters and supplied as a constant-time-checked Bearer token.
- Queue requests reuse the S18 allowlisted sources and request PII guard. CandidateLead, private contacts, unlock, Credit, and private analytics are not queryable source types.
- Generated content persists through the canonical S18 service as `contentOrigin = AI`, `status = DRAFT`, and `publishedAt = null`.
- Future publication is an explicit active-admin action from the canonical edit page; public DAL and sitemap remain hidden until `publishedAt <= now`.

## Gates

- AUDIT / PLAN: PASS — no reusable production cron/queue/background runner found; CBT retry tooling intentionally not reused across its protected offline boundary.
- CONTRACT LOCK: PASS — PostgreSQL queue; no external infrastructure; active-admin/human-review boundary preserved.
- BUILD: PASS — schema/migration, queue service, cron boundary, admin operations page/actions, reviewed publish scheduling, env documentation, reproducible disposable E2E.
- TEST: PASS — focused automation 3 files / 11 tests; Blog/S17-S19 regression 13 files / 56 tests; full repository 108 files / 1,165 tests PASS and 4 skipped.
- REVIEW: PASS — 37 full-suite failures are the exact pre-existing CBT evidence/runlog omissions documented at S18; S20 changed no CBT file or behavior.

## Verification

- Prisma validate: PASS
- Prisma generate: PASS
- Focused automation/idempotency/auth/scheduling: 3 files / 11 tests PASS
- Blog canonical + S17-S19 regression: 13 files / 56 tests PASS
- Full repository: 108 files / 1,165 tests PASS; 4 skipped; 37 pre-existing CBT evidence failures
- TypeScript typecheck: PASS
- ESLint: 0 errors; 21 pre-existing warnings
- Next.js 16.3.0 Turbopack production build: PASS; `/admin/blog/automation` and `/api/cron/blog-content` generated
- `git diff --check`: PASS
- Disposable PostgreSQL migration from zero: 18 migrations PASS
- Real PostgreSQL fake-provider E2E: queue claim -> AI DRAFT hidden publicly -> simulated crash replay; provider calls 1, article rows 1 — PASS
- Disposable DB `gto_s20_codex_20260824`: removed after verification

## Migration impact

Migration: `20260824232000_add_blog_content_automation`

- Adds `BlogContentJobStatus` and `BlogContentAttemptStatus` enums.
- Adds `blog_content_jobs`, `blog_content_job_attempts`, and `blog_automation_controls`.
- Adds nullable unique `blog_articles.automationJobId` and scoped foreign keys/indexes.
- Migration is additive; no existing table/column/data is dropped.

## Deferred production operations

- Apply the migration in the deployment release process.
- Configure `BLOG_AUTOMATION_CRON_SECRET` and existing `BLOG_AI_*` secrets.
- Configure an approved scheduler to invoke GET or POST `/api/cron/blog-content` with the Bearer secret. No scheduler vendor/config was selected in this local change.
- Perform one authorized production-provider smoke test and monitor the admin operations page. No live provider call or production DB mutation was performed here.

## Final decision

S20: LOCAL PASS. Remote push, merge/integration, production migration, scheduler provisioning, and deployment remain separate approval gates.
