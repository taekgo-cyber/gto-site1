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

## Current gate

BLOG CANONICAL = COMPLETE after Gate 4 checkpoint commit.
S18 Gates 5-13 remain next in this Track.
