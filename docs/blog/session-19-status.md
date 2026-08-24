# Session 19 Track A — Blog SEO and Internal Linking

## Result

Date: 2026-08-24

Branch: `track-a/blog-ai-content`

Baseline: `7df12b952a0fcf13feaaf1bf7404f8f75f6e730b`

Protected scope: Track B worktree/branch, CBT behavior/data/tooling, Lead/Ads/Credit contracts

S19 is complete. Public Blog articles now connect to authoritative public CBT, Jobs, Lease, and related Blog destinations without storing or trusting AI-generated URLs.

## Locked contract

- Blog public visibility remains fail-closed: `PUBLISHED` plus non-null `publishedAt <= now`.
- Related articles are selected from a bounded set of public rows, exclude the current article, and rank same-category/shared-tag candidates.
- CBT CTA uses only an active category that has at least one published question; otherwise it uses the canonical `/cbt` index only when a public category exists.
- Jobs and Lease CTAs are emitted only when their canonical public DAL predicates find at least one currently published row.
- No CandidateLead, contact, private Company, Credit, unlock, or analytics data is read.
- AI output never supplies or persists internal destination URLs.
- Article metadata adds canonical Open Graph URL, modified time, tags, Twitter card, and Article JSON-LD only after the public DAL resolves the article.

## Gates

- AUDIT / PLAN: PASS — existing metadata, canonical, robots, sitemap, public routes, Blog DAL, service routes, and Next.js 16.3 metadata/sitemap documentation reviewed.
- CONTRACT LOCK: PASS — schema-free derived linking; public DB/router authority; no shared layout/navigation/style changes.
- BUILD: PASS — Blog discovery DAL/ranking, responsive CTA/related-content component, Article metadata and JSON-LD.
- TEST: PASS — focused discovery 4/4; Blog/S17/S18 regression 10 files / 45 tests; typecheck; lint; production build.
- REVIEW: PASS — no schema/migration/package/env change; `git diff --check` PASS; Track B untouched.

## Changed files

- `src/lib/blog/discovery.ts`
- `src/components/blog/BlogDiscovery.tsx`
- `src/app/blog/[slug]/page.tsx`
- `src/lib/blog/dal.ts`
- `src/lib/blog/types.ts`
- `src/__tests__/blog.discovery.test.ts`
- `docs/blog/session-19-status.md`
- `docs/blog/TRACK-A-STATUS.md`

## Verification

- Focused SEO/internal-link tests: 1 file / 4 tests PASS
- Blog canonical + S18 regression: 10 files / 45 tests PASS
- TypeScript typecheck: PASS
- ESLint: 0 errors; 21 pre-existing warnings
- Next.js 16.3.0 Turbopack production build: PASS; public Blog, CBT, Jobs, Lease, robots, and sitemap routes generated
- `git diff --check`: PASS
- Prisma/schema/migration impact: none

## Deferred

- No external SEO crawler or production Search Console submission was performed.
- No global navigation/layout modification was made because Track B currently owns dirty shared UX files.

## Final decision

S19: PASS. Proceed to S20 from the S19 checkpoint.
