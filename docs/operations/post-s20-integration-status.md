# POST-S20 Master Integration Status

Date: 2026-08-25 (Asia/Seoul)

Final decision: **MASTER INTEGRATION PASS**

## 2026-08-25 canonical gate re-audit

The repository was re-audited from the live Git graph before S21 continuation.
The canonical code baseline remains `ae7b82f15049555c51f8282e9271efc38f7c17f7`.

- Repository: `C:\Users\taekg\gto-site1`
- Integration branch: `integration/post-s20-master`
- Source Track A: `track-a/blog-ai-content` at `321d6ed8bcfc9dea863dd005cfb6fe32796f0306`
- Source Track B: `track-b/mobile-prod-readiness` at `9fd26178cfa085d0bd432642922b47294e6d9727`
- Exact common ancestor: `631a78c9f58b0637b3e19b8d429302bc6cafb426`
- Local `main`: `ae7b82f15049555c51f8282e9271efc38f7c17f7`
- Remote `origin/main`: `c7bae16068bd4ab0b7b465bdc37ee8fe0039f285`
- Remote Track A/Track B heads match their local source branches exactly.
- A separate `codex/s21-unified-search` worktree already exists above `ae7b82f`; it and its pre-existing untracked artifacts were excluded from this integration gate.

Track B is the cross-cutting **Mobile / UX / Performance / Production Readiness** track. It is not a single S23 session.

Current re-verification evidence and external environment limits are recorded in
`docs/operations/track-ab-canonical-integration-gate.md`.

## Git sources

- Integration branch: `integration/post-s20-master`
- Canonical baseline: `631a78c9f58b0637b3e19b8d429302bc6cafb426`
- Track B source: `9fd26178cfa085d0bd432642922b47294e6d9727`
- Track A source: `321d6ed8bcfc9dea863dd005cfb6fe32796f0306`
- Initial integration merge: `23ef011f2ef95140f0ca78e768f30626732313ac`
- Track A remote state at audit: `ahead 0 / behind 0`
- Track B remote state at audit: `ahead 0 / behind 0`
- Integration branch upstream: none
- Remote push: not performed
- Local `main` currently points at the canonical baseline; this gate did not move it.
- Remote `main` update: not performed

The source branches share `631a78c` as their exact merge base. Track B changed 33 files and Track A changed 52 files from that base; their changed-file intersection was empty. The integration therefore used Track B as the first parent and merged Track A with a two-parent, non-fast-forward merge.

Included scope:

- existing S1-S16, CBT, Lead, Monetization and analytics baseline
- Track A S17 Blog CMS (`3f1d300`)
- Track A S18 AI Draft Workflow (`7df12b952a0fcf13feaaf1bf7404f8f75f6e730b`)
- Track A S19 SEO/internal linking (`cca5212167b6c1619147a9ed3066510ee3f26a51`)
- Track A S20 content automation (`321d6ed8bcfc9dea863dd005cfb6fe32796f0306`)
- Track B Gates 0-16 mobile, accessibility, performance and production readiness (`9fd2617`)

## Worktree audit and isolation

- Main integration worktree had no tracked or staged changes at Gate 0.
- Eleven pre-existing untracked helper/evidence artifacts were preserved and excluded.
- The detached CBT runner worktree contains separate tracked and untracked work; it was not modified or integrated.
- Lead, Monetization, S17 and Track A worktrees were inspected read-only and left untouched.
- Production DB touched: **NO**
- Production deploy performed: **NO**
- Production scheduler/provider/secret configured: **NO**
- Existing local `gto_site` DB mutated by this integration: **NO**

## Conflict and shared-file resolution

Git merge conflicts: **0**.

Critical shared areas were reviewed manually: root layout/styles, Header, Button/Input/Select, `next.config.ts`, error/not-found/global-error, health/readiness, sitemap, admin routes, Prisma schema/migrations and package scripts.

Two bounded integration corrections were required:

1. `src/components/layout/Header.tsx`
   - Restored the canonical `/blog` navigation entry from S16.
   - Preserved Track B's responsive horizontal navigation, 44px targets and accessibility labeling.
2. `prisma/schema.prisma`
   - Added physical `map` names for two pre-existing `CompanyRecruitmentEntitlement` indexes whose migration names exceed PostgreSQL's 63-byte identifier limit.
   - This aligns Prisma schema metadata with the names PostgreSQL created by truncation; table shape and index columns did not change, and historical migrations were not rewritten.

No package, lockfile or dependency change was made.

## Database and migrations

- Prisma validate: PASS
- Prisma Client generate: PASS (`7.9.1`)
- Migration directories: 18, unique and ordered
- Fresh local disposable PostgreSQL: PASS
- Zero-to-latest `prisma migrate deploy`: 18/18 PASS
- `prisma migrate status`: up to date
- Schema-to-disposable-DB diff after physical index mapping: no difference
- Blog tables, enums, foreign keys, queue indexes and unique constraints: confirmed
- S20 PostgreSQL fake-provider E2E: PASS
  - first claim succeeded
  - generated article remained `AI`/`DRAFT` with `publishedAt = null`
  - public lookup stayed hidden
  - crash replay used one provider call and one article row
- Disposable DB `gto_s20_post_integration_20260825`: removed after verification

Production PostgreSQL was never contacted or mutated.

## Verification

Focused tests:

- Blog S17-S20: 13 files / 56 tests PASS
- Lead, Monetization, CBT, Lease, Company, SEO and analytics: 35 files / 362 tests PASS

Full regression:

- Vitest: 114 files / 1,206 tests PASS
- Previously documented isolated Track A CBT evidence failures did not reproduce in this canonical worktree.

Static and build checks:

- TypeScript `tsc --noEmit`: PASS
- canonical source ESLint (`next.config.ts prisma.config.ts src prisma tools`): 0 errors / 14 warnings
- Prisma validate/generate: PASS
- Next.js 16.3.0 Turbopack production build: PASS
- `git diff --check`: PASS
- production route manifest includes Blog public/admin/AI/automation, cron, health and readiness routes

Known non-regression:

- Raw `npm run lint` scans two pre-existing untracked root helpers, `check-env.js` and `check-env-pattern.js`, and reports two `no-require-imports` errors. They existed before Gate 0 and were intentionally not edited, deleted or committed.
- The 14 canonical warnings are existing unused-variable warnings plus the two Track A Blog `<img>` optimization warnings documented by Track A; canonical lint has zero errors.

## Browser E2E

Executed against `next start` and the migrated/seeded local disposable DB.

- Desktop viewport: 1440x900
- Mobile viewport: 390x844
- Home and main navigation: PASS, including restored Blog link and skip link
- Blog list/article/category data path: PASS
- CBT category/practice: PASS; server grading returned answer/explanation only after selection
- CBT exam route: PASS
- Jobs and Lease: PASS
- Candidate Lead owner route: PASS
- Company Lead/Ads/Operations routes: PASS with correct no-active-membership fail-closed state
- Admin Blog/AI/Automation, Ads, Leads and Companies routes: PASS with active ADMIN
- unauthenticated protected route redirect: PASS
- login/logout: PASS
- signup/login mobile forms and labels: PASS; no durable signup account was retained
- custom 404 UI and HTTP 404 status: PASS
- `/api/health`: 200, no-store, noindex
- `/api/ready`: 200 against disposable DB, no-store, noindex
- `/api/cron/blog-content` without configured secret: 401 `UNAUTHORIZED`
- security headers: CSP frame/base/object/form restrictions, DENY framing, nosniff, referrer and permissions policies PASS
- `X-Powered-By`: absent
- page-level horizontal overflow: 0 on all audited mobile routes; intentional Header nav scrolling remained contained
- final browser console: 0 errors / 0 warnings

## Security and privacy invariants

- AI generation persists only through the canonical Blog create service as DRAFT with null `publishedAt`.
- Public Blog DAL/sitemap require effective publication time.
- AI source type is a closed allowlist and does not query CandidateLead, LeadMatch, unlock, Credit, contact or private analytics domains.
- Source/request PII redaction and PII rejection remain active.
- Active ADMIN is checked before source/provider cost and rechecked before persistence.
- Automation cron fails closed when the secret is absent, short or mismatched and compares equal-length secrets with `timingSafeEqual`.
- Session cookies remain HttpOnly, SameSite=Lax and Secure in production.
- Advertisement analytics stores campaign/placement/event attribution only, with no raw IP, user-agent, name, phone or email field.
- Advertisement entitlement and Contact Unlock checks remain fail-closed and DB-authoritative.
- Pre-unlock Lead DTO/operations pages do not bulk expose contact PII.

Gemini final cross-check was not run: repository-wide `cwd` access would transmit source to an external model and requires separate explicit approval. The attempted request was rejected before any repository content was sent. This optional cross-check is not a local validation blocker.

## Deferred production requirements

The following remain intentionally outside this Integration Gate:

- production migration and deployment
- production `BLOG_AUTOMATION_CRON_SECRET` / `BLOG_AI_*` configuration
- scheduler connection and test-fire
- paid/real AI provider smoke
- durable upload storage or object-storage adapter
- production backup/PITR and restore rehearsal
- health/readiness alert destination and test alert
- canonical HTTPS `NEXT_PUBLIC_SITE_URL`
- strict nonce CSP decision after final hosting/external scripts are known
- any real PG/payment provider integration

## Canonical handoff

This integration branch remains the audited POST-S20 canonical line. No push,
remote-main update, production migration or deployment was performed. The
separate existing S21 branch was not rewritten or merged by this gate.
