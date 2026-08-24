# Track A — Blog Canonical + S18 Status

## Canonical Blog decision

- Base: `a630b09` (`BlogArticle` + normalized `BlogCategory`).
- Ported from `07eeb7d`: tags, featured image URL/ALT, stronger URL validation, dedicated `/admin/blog/new` authoring UX, terminal archive lifecycle hardening.
- Intentionally not kept: `BlogPost` parallel schema/table/enum. Only one canonical Blog entity is allowed.
- Protected shared navigation/layout was not changed. Sitemap is the only shared route file changed because public Blog indexing requires it.

## Canonical Blog contract

`BlogArticle` supports:

- `title`
- `slug` (unique)
- `excerpt`
- `contentMarkdown`
- `status`: `DRAFT | PUBLISHED | ARCHIVED`
- normalized optional `BlogCategory`
- `tags` JSON string array
- `featuredImageUrl` / `featuredImageAlt`
- `seoTitle` / `seoDescription`
- `publishedAt`
- `createdAt` / `updatedAt`
- nullable `authorId` relation to `User`

Public visibility is fail-closed: `status = PUBLISHED` and `publishedAt <= now` with non-null `publishedAt`.

Lifecycle:

- create -> `DRAFT`
- `DRAFT` -> `PUBLISHED` or `ARCHIVED`
- `PUBLISHED` -> `DRAFT` (unpublish) or `ARCHIVED`
- `ARCHIVED` is terminal; no edit or republish

Security:

- every service mutation re-checks DB-backed `ACTIVE ADMIN`
- Markdown is rendered to React nodes; raw HTML is never executed and `dangerouslySetInnerHTML` is not used
- Markdown links allow internal/hash/http/https only; protocol-relative, `javascript:`, `data:` and other schemes are not linked
- featured image URL allows http/https only and requires ALT text
- public DAL never returns draft, archived or future-published rows

## Routes

Admin:

- `/admin/blog`
- `/admin/blog/new`
- `/admin/blog/[id]/edit`
- `/admin/blog/[id]/preview`

Public:

- `/blog`
- `/blog/[slug]`
- `/blog/category/[slug]`
- `/sitemap.xml` integration

## Gate 0-3 evidence

- Gate 0 isolation: dedicated worktree `C:\Users\taekg\gto-site1-track-a`, branch `track-a/blog-ai-content`, baseline `631a78c`.
- Gate 1 architecture: PASS, A base + bounded B port.
- Gate 2 focused tests: PASS.
- Gate 3 focused Blog tests: 4 files / 21 tests PASS.
- Prisma validate: PASS.
- Prisma generate: PASS.
- Typecheck: PASS.
- ESLint: 0 errors (repository warnings remain; two Blog `<img>` optimization warnings are non-blocking).
- Default Next/Turbopack production build: PASS.
- `git diff --check`: PASS.
- Disposable PostgreSQL migration from zero: 16 migrations applied, schema up to date.
- Blog tables: `blog_articles`, `blog_categories` confirmed.
- Unique indexes: article slug and category slug confirmed.
- Real PostgreSQL Blog E2E: Draft hidden, non-admin blocked, duplicate slug blocked, publish visible, category visible, sitemap include/remove, future publication hidden, archive terminal — PASS.

## S18 integration interface

S18 must create Blog content only through a DRAFT-producing application service. AI generation must never call the public publish transition directly.

Minimum generated draft payload:

```ts
type GeneratedBlogDraft = {
  title: string;
  slug: string;
  excerpt: string;
  contentMarkdown: string;
  seoTitle: string | null;
  seoDescription: string | null;
  suggestedCategorySlug: string | null;
  tags: string[];
};
```

S18 request contract:

```ts
type AiContentGenerationRequest = {
  topic: string;
  targetKeyword: string;
  sourceType: string;
  sourceIds: string[];
  instruction?: string;
};
```

Pipeline invariant:

`SITE DATA -> AI GENERATE -> BLOG DRAFT -> ADMIN REVIEW/EDIT -> EXISTING BLOG PUBLISH -> PUBLIC BLOG/SITEMAP`

No CandidateLead PII, person name, phone number, personal email, lead/unlock/credit/ad analytics private data may be supplied to the AI content source layer.

## S18 Gates 5-13 closeout

S18 AI Blog content workflow is implemented on top of the canonical `BlogArticle` service:

- provenance schema: `contentOrigin = MANUAL | AI` plus nullable `aiGenerationMeta`
- allowlisted public source projection for Lease, Region, Tonnage, Vehicle Type, public Company fields, CBT Category, and published Blog
- no CandidateLead, LeadMatch, Unlock, Credit, advertisement analytics, private company fields, or user contact fields in the AI source contract
- defense-in-depth redaction for email, phone, and explicitly labelled person names, including free-text source labels
- OpenAI-compatible provider boundary with timeout, HTTP/JSON/schema fail-closed handling, and untrusted-source prompt-injection instruction
- runtime request and provider-output validation independent of TypeScript types
- static quality guard for PII, raw HTML, unsafe Markdown URL, short body, unsupported numeric claims, duplicate slug, and duplicate title
- DB-backed `ACTIVE ADMIN` authorization before source reads/provider cost, rechecked by canonical Blog persistence
- generated content persists only through canonical `createBlogArticle` as `AI` + `DRAFT` + `publishedAt = null`
- admin route `/admin/blog/ai`, source selector, generation action, edit-page AI provenance/quality notice, and explicit human review flow
- provider configuration documented in `.env.example` (`BLOG_AI_BASE_URL`, `BLOG_AI_API_KEY`, `BLOG_AI_MODEL`)

S18 verification on 2026-08-24:

- AI-focused tests: 5 files / 20 tests PASS
- canonical Blog + S18 regression: 9 files / 41 tests PASS
- Prisma validate: PASS
- Prisma generate: PASS
- Typecheck: PASS
- ESLint: 0 errors (21 pre-existing repository warnings)
- Next/Turbopack production build: PASS; `/admin/blog/ai` included
- `git diff --check`: PASS
- disposable PostgreSQL migration from zero: 17 migrations applied; `BlogContentOrigin`, `contentOrigin`, and `aiGenerationMeta` confirmed
- real PostgreSQL fake-provider E2E: `DRAFT`, `contentOrigin = AI`, `publishedAt = null`, provenance stored, public DAL hidden — PASS
- full repository test run: 104 files / 1,150 tests PASS, 4 skipped; 37 existing CBT evidence tests FAIL because historical `data/cbt` evidence/runlog artifacts are absent from this isolated worktree. The failures do not touch Blog/S18 code.

No live paid provider call was made. Deployment must configure the `BLOG_AI_*` environment variables, then an administrator can run the operational provider smoke test from `/admin/blog/ai`.

## S19 SEO and internal linking closeout

S19 adds a schema-free public discovery layer to the canonical Blog article page. Related articles are ranked from bounded, public-only candidates using category and tag overlap. CBT, Jobs, and Lease CTAs appear only when their authoritative public predicates have a real destination; CBT category slugs come from active DB rows with published questions. Article Open Graph/Twitter metadata and Article JSON-LD use the public article contract. No AI-generated URL is stored or trusted, no private source is read, and shared Track B navigation/layout/styles remain untouched.

Verification on 2026-08-24: focused discovery 4/4 PASS; Blog/S17/S18 regression 10 files / 45 tests PASS; typecheck PASS; ESLint 0 errors (21 pre-existing warnings); Next.js 16.3.0 production build PASS; no Prisma/schema/migration impact; `git diff --check` PASS. Full details: `docs/blog/session-19-status.md`.

## S20 content automation closeout

S20 adds an external-infrastructure-free PostgreSQL queue around the S18 DRAFT generator: unique topic/idempotency keys, atomic claims, attempt audit, stale recovery, bounded retry, KST daily budget, DB pause/cancel, admin operations UI, and a fail-closed Bearer-protected cron route. A unique queue-to-article relation makes crash replay reuse an existing generated DRAFT without a second provider call. Administrators can explicitly schedule a reviewed DRAFT for a future publication time; automation never publishes.

Verification on 2026-08-24: focused automation 3 files / 11 tests PASS; Blog/S17-S19 regression 13 files / 56 tests PASS; full repository 1,165 PASS / 4 skipped with the same 37 missing CBT evidence failures; Prisma validate/generate PASS; 18 migrations from zero PASS; fake-provider queue/DRAFT/replay E2E PASS; typecheck/lint/build PASS. Full details: `docs/blog/session-20-status.md`.

## Current gate

BLOG CANONICAL = COMPLETE after Gate 4 checkpoint commit.
S18 GATES 5-13 = COMPLETE.
S19 = COMPLETE at `cca5212`.
S20 = LOCAL COMPLETE; ready for checkpoint commit. Push/integration/deployment require separate approval.
