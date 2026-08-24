# Session 18 Track A — AI Blog Content Final

## Result

S18 Track A is complete on branch `track-a/blog-ai-content`.

The implemented publishing invariant is:

`ALLOWLISTED SITE DATA -> AI PROVIDER -> QUALITY GUARD -> AI BLOG DRAFT -> ADMIN REVIEW/EDIT -> EXISTING BLOG PUBLISH`

AI generation never invokes the Blog publish transition. Every generated article is persisted through the canonical Blog application service with:

- `contentOrigin = AI`
- `status = DRAFT`
- `publishedAt = null`
- bounded generation provenance in `aiGenerationMeta`

## Delivered

- `BlogContentOrigin` Prisma enum and AI provenance migration
- OpenAI-compatible provider boundary with timeout and HTTP/JSON/schema fail-closed behavior
- runtime request/output validation and canonical slug normalization
- allowlisted source projections for published Lease, active Region/Tonnage/Vehicle Type, public Company fields, active CBT Category, and published Blog
- explicit exclusion of CandidateLead, LeadMatch, contact Unlock, Credit, advertisement analytics, private company fields, and user contact fields
- email, phone, and labelled person-name redaction for free-text source data and labels
- quality checks for PII, raw HTML, unsafe Markdown URLs, unsupported numeric claims, duplicate slug/title, and short content
- DB-backed `ACTIVE ADMIN` authorization before source reads and provider calls, rechecked before persistence
- administrator UI at `/admin/blog/ai`
- AI provenance and quality notice on the canonical Blog edit page
- `BLOG_AI_BASE_URL`, `BLOG_AI_API_KEY`, and `BLOG_AI_MODEL` deployment configuration documentation

## Verification

Completed on 2026-08-24:

- AI-focused tests: 5 files / 20 tests PASS
- canonical Blog + S18 regression: 9 files / 41 tests PASS
- TypeScript typecheck: PASS
- Prisma validate: PASS
- Prisma generate: PASS
- ESLint: 0 errors; 21 pre-existing repository warnings
- Next.js 16.3.0 Turbopack production build: PASS
- `/admin/blog/ai` production route generation: PASS
- `git diff --check`: PASS
- disposable PostgreSQL migration from zero: 17 migrations PASS
- migrated `BlogContentOrigin`, `contentOrigin`, and `aiGenerationMeta`: confirmed
- real PostgreSQL fake-provider E2E: AI DRAFT persisted, provenance preserved, `publishedAt` null, public DAL hidden — PASS

The full repository run produced 1,150 passing tests and 4 skipped tests. The remaining 37 failures are pre-existing CBT evidence tests whose historical `data/cbt` evidence and runlog artifacts are absent from this isolated worktree; they do not touch Blog or S18 code.

## Operational handoff

No live paid provider call was made during verification. Before operational use:

1. Configure `BLOG_AI_API_KEY` and, if needed, `BLOG_AI_BASE_URL` / `BLOG_AI_MODEL` in the deployment secret environment.
2. Apply the Prisma migration during deployment.
3. Sign in as an active administrator and run one provider smoke test from `/admin/blog/ai`.
4. Confirm the generated article opens in the existing Blog editor as an unpublished AI DRAFT.

No secret values, production database mutation, automatic publication, or paid provider request was included in this checkpoint.
