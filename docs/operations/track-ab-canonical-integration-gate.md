# Track A/B Canonical Integration Gate

Date: 2026-08-25 (Asia/Seoul)

Status: **COMPLETE / PASS — CODE READY, DB-DEPENDENT E2E ENVIRONMENT BLOCKER**

This gate integrates and re-verifies completed work. It does not implement S21
features, mutate production infrastructure or rewrite source-branch history.

## Git truth

| Item | Value |
| --- | --- |
| Repository | `C:\Users\taekg\gto-site1` |
| Integration branch | `integration/post-s20-master` |
| Track A branch | `track-a/blog-ai-content` |
| Track A checkpoint | `321d6ed8bcfc9dea863dd005cfb6fe32796f0306` |
| Track B branch | `track-b/mobile-prod-readiness` |
| Track B checkpoint | `9fd26178cfa085d0bd432642922b47294e6d9727` |
| Common baseline | `631a78c9f58b0637b3e19b8d429302bc6cafb426` |
| Two-parent integration merge | `23ef011f2ef95140f0ca78e768f30626732313ac` |
| Canonical code baseline before this audit | `ae7b82f15049555c51f8282e9271efc38f7c17f7` |
| Local `main` at audit | `ae7b82f15049555c51f8282e9271efc38f7c17f7` |
| Remote `origin/main` at audit | `c7bae16068bd4ab0b7b465bdc37ee8fe0039f285` |
| Remote source branches | exact match with local Track A and Track B |
| Canonical audit checkpoint | Gate 15 commit containing this document; read exact SHA from integration branch HEAD |

The root worktree was on `codex/s21-unified-search` at `9c1fe65374c397d38774bff10c88530c3333562f`
with only pre-existing untracked artifacts. It was not modified. The integration
gate ran in an ignored, isolated worktree.

## Track status audit

| Item | Track A | Track B |
| --- | --- | --- |
| Completed scope | Blog CMS, AI draft, SEO/internal links, content automation through S20 | Mobile, accessibility, performance, error/health/readiness, security/privacy and production operations readiness |
| Changed files from common baseline | 52 | 33 |
| Migrations | 4 additive Blog migrations | none |
| Package/lock changes | none | none |
| Canonical status | `docs/blog/TRACK-A-STATUS.md` and S16/S18/S19/S20 status | `docs/operations/track-b-release-readiness.md` and operations runbooks |
| Source worktree state | clean | no connected worktree; branch and remote object verified |

Track B is the cross-cutting **Mobile / UX / Performance / Production Readiness**
track. It is not a single S23 session.

## Conflict and integration contract

The changed-file intersection after the common baseline is empty. Semantic
overlap was still audited.

| Area | Track A | Track B | Resolution |
| --- | --- | --- | --- |
| Package/lock/test config | unchanged | unchanged | baseline retained; no dependency added |
| Prisma | Blog schema and four migrations | unchanged | migration history retained; physical names of two pre-existing long indexes aligned without rewriting SQL |
| Next config/security | no change | global security headers | Track B headers apply to Blog/admin/API routes |
| Layout/shared UI | new routes | responsive/a11y shell and controls | Track B behavior retained |
| Navigation | public Blog added | responsive Header changed | Blog entry added while preserving Track B mobile behavior |
| Sitemap/metadata | Blog discovery and sitemap | unchanged | Track A public visibility predicates retained |
| Admin/auth | Blog/AI/automation | Ads/Lead UX | separate routes; DB-backed active-admin checks retained |
| Env/cron/operations | AI and cron secrets | production runbooks | fail-closed cron plus explicit external scheduler/env TODO |
| Images/Markdown | featured images and safe renderer | image/performance improvements | no raw HTML execution; URL allowlist retained |
| Analytics/logging/privacy | public-only AI sources | PII-safe readiness contract | no CandidateLead/contact/raw IP/full UA source or analytics field |

The existing `23ef011` merge and `ae7b82f` bounded corrections were accepted as
the canonical integration. Source branches, local `main`, the separate S21
branch and production systems were not changed.

## Gate results

| Gate | Content | Result |
| --- | --- | --- |
| 0 | Repository preflight | PASS |
| 1 | Canonical status audit | PASS |
| 2 | Conflict/overlap audit | PASS |
| 3 | Integration contract lock | PASS |
| 4 | Canonical integration tree | PASS |
| 5 | Prisma/migration integrity | PASS for static chain; local DB runtime unavailable |
| 6 | Static quality | PASS |
| 7 | Focused regression | PASS |
| 8 | Full regression | PASS |
| 9 | Production build | PASS |
| 10 | Cross-track smoke/E2E | PASS for DB-independent smoke; DB-dependent browser flows externally blocked |
| 11 | Security/privacy/readiness | PASS |
| 12 | External production TODO extraction | PASS |
| 13 | Canonical documentation | PASS |
| 14 | Final diff review | PASS when the recorded diff checks remain clean |
| 15 | Canonical checkpoint | PASS through the commit containing this document |
| 16 | S21 entry verdict | GO |

## Current verification

All figures below were produced in this canonical integration worktree during
this gate.

- Track A focused regression: 13 files / 56 tests PASS.
- Track B affected-domain regression: 23 files / 254 tests PASS.
- Full Vitest: 114 files / 1,206 tests PASS.
  - An initial isolated run exposed the known absence of ignored CBT evidence:
    1,165 pass / 37 fail / 4 skip.
  - The root's existing CBT evidence was then connected read-only for the test
    run; all 1,206 tests passed. Tests copied mutable fixtures only to OS temp.
- Next.js route types: `next typegen` PASS.
- TypeScript: `tsc --noEmit` PASS after route type generation.
- ESLint: 0 errors / 14 warnings. Warnings are the existing unused-variable and
  two Blog native-image optimization warnings.
- Prisma validate: PASS.
- Prisma Client generate: PASS, Prisma 7.9.1.
- Migration static audit: 18 directories, unique names, lexical order intact,
  no duplicate model/enum names, and no destructive SQL pattern in the chain.
- Local migration runtime: not executed because `localhost:5432` was not
  listening and Docker/PostgreSQL tooling was unavailable. The configured URL
  was confirmed local; no production DB was contacted.
- Next.js 16.3.0 Turbopack production build: PASS after using a real lockfile
  dependency tree in the isolated worktree.
- Production route manifest includes public/admin Blog, AI, automation, cron,
  health/readiness, Jobs, Lease, CBT, Lead and Admin routes.
- `git diff --check`: PASS before documentation update; repeated at Gate 14.

## Production-server smoke

Executed against the current `next start` build on `127.0.0.1:3107`:

| Flow | Result |
| --- | --- |
| `/api/health` | 200 `{"status":"ok"}`, no-store, noindex |
| `/api/ready` | 503 `{"status":"unavailable"}` because local PostgreSQL was down; no DB detail exposed |
| unauthenticated Blog cron | 401 `{"error":"UNAUTHORIZED"}` |
| `robots.txt` | 200 |
| custom missing route | 404 |
| login / signup / Lease | 200 |
| protected Company / Admin Blog | 307 to `/login` |
| Home / Jobs / CBT / Blog | 500 caused by local PostgreSQL `ECONNREFUSED` |
| security headers | CSP, DENY framing, nosniff, referrer and permissions policy PASS |
| `X-Powered-By` | absent |

The DB-dependent 500 responses are environment failures, not masked as code
successes. A current authenticated, data-backed browser matrix requires an
available disposable PostgreSQL environment.

## Security and privacy recheck

- Only `.env.example` is tracked; it contains documented placeholders, not a
  live secret.
- Session cookies remain HttpOnly, SameSite=Lax and Secure in production.
- Blog admin pages/actions and every Blog mutation recheck a DB-backed active
  ADMIN. Preview authorization is protected.
- AI sources are a closed public allowlist: Lease, Region, Tonnage, Vehicle
  Type, public Company fields, CBT Category and effectively published Blog.
- CandidateLead, LeadMatch, unlock, credit, contact and private analytics data
  are not AI source types.
- Request/source redaction and output quality checks reject email, phone,
  explicitly labelled person names, raw HTML and unsafe Markdown URLs.
- AI generation persists only through the canonical Blog service as `DRAFT`
  with `publishedAt = null`; publication remains an explicit admin transition.
- The cron endpoint fails closed when its secret is missing, short or unequal
  and uses equal-length `timingSafeEqual` comparison.
- Advertisement analytics stores attribution/event fields without raw IP,
  full user-agent, name, phone or email fields.
- Application error/readiness logs emit event, error name and opaque digest;
  no request body, cookie, credential, raw IP or full user-agent is logged by
  the audited application code.

## External production TODO

| Classification | Item | Exit condition |
| --- | --- | --- |
| NOW REQUIRED BEFORE S21 | None | S21 code work may continue from the canonical code contract without production infrastructure. |
| REQUIRED BEFORE S24 | Restore a disposable/staging PostgreSQL environment | Repeat zero-to-latest migration, seed and full authenticated desktop/mobile E2E. |
| REQUIRED BEFORE S24 | Durable upload decision | Provision a persistent volume or implement and verify an approved object-storage adapter. |
| REQUIRED BEFORE S24 | S23 payment prerequisites | Approve PG provider, price/tax/refund policy, sandbox secrets and webhook strategy before payment implementation. |
| REQUIRED BEFORE PRODUCTION LAUNCH | Production env/secrets | Configure `DATABASE_URL`, `AUTH_SECRET`, canonical HTTPS site URL, Lead policy and Blog AI/cron secrets without logging values. |
| REQUIRED BEFORE PRODUCTION LAUNCH | Production migration | Backup first, then run one reviewed `prisma migrate deploy` release step and retain evidence. |
| REQUIRED BEFORE PRODUCTION LAUNCH | Backup/PITR and restore rehearsal | Enable provider backup/PITR and measure DB plus upload RPO/RTO in a restore drill. |
| REQUIRED BEFORE PRODUCTION LAUNCH | Scheduler and AI provider | Connect the approved scheduler, test-fire cron authentication and run one authorized provider smoke. |
| REQUIRED BEFORE PRODUCTION LAUNCH | Monitoring/alerting | Connect at least one health/readiness destination and test an alert. |
| REQUIRED BEFORE PRODUCTION LAUNCH | Domain/edge configuration | Verify HTTPS canonical origin, DNS/CDN behavior, sitemap/robots and the final CSP decision. |
| REQUIRED BEFORE PRODUCTION LAUNCH | PG/webhook external config | Configure signed sandbox/production endpoints only after the S23 contract and separate launch approval. |
| POST-LAUNCH | SEO operations | Verify Search Console ownership, submit sitemap and monitor indexing/content operations. |
| POST-LAUNCH | Operational tuning | Tune alert thresholds, review Core Web Vitals and repeat restore/credential-rotation drills. |

## Deferred

- S21 feature implementation.
- Any rebase or history rewrite of Track A, Track B, main or the existing S21 branch.
- Remote push or remote-main update.
- Production migration, deployment, scheduler setup, provider call or payment operation.
- New dependency, external search engine, vector DB or architectural rewrite.

## S21 entry verdict

**S21 ENTRY: GO**

The exact canonical code baseline is
`ae7b82f15049555c51f8282e9271efc38f7c17f7`. The Gate 15 documentation/audit
checkpoint is the final HEAD of `integration/post-s20-master`; it does not alter
the code tree represented by that baseline. The separate existing S21 branch is
outside this gate and must not be rebased or overwritten by this result.
