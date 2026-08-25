# S24 Launch Validation / Monetization Optimization / Growth Scale Plan

Date: 2026-08-26

Baseline and S23 checkpoint: `f0090a802bbc3f35686aa72e0b76d93e62ce684c`

Branch: `codex/s24-launch-validation`

## 1. Baseline

- S24 starts directly from the S23 final checkpoint, not from `main`.
- The tracked and staged S23 baseline was clean. The eleven pre-existing untracked
  artifacts listed in `S23-STATUS.md` remain preserved and excluded from S24.
- No push, merge, production deploy, production migration, charge, credential change,
  external message or production data mutation is authorized.

## 2. Existing functionality to reuse and validate

- Public Landing, Jobs, Lease, Blog, CBT, Search and ACTIVE Company routes
- Session authentication, owner/company/admin authorization and suspended-company isolation
- Candidate Lead draft/activation/state, discovery, match, quota/entitlement-backed unlock
  and pre-unlock PII boundary
- Advertisement serving, impression dedupe, click attribution, Lead conversion and admin KPI
- Support inquiry rate limiting, opaque status capability, admin reply/status and notification
- In-app notification consent/read/user isolation
- KST launch policy, maintenance fail-safe, `FREE_ONLY`, structured redacted logging,
  health/readiness, Admin Ops, production preflight and recovery runbooks

## 3. Actual gaps found

1. The global `구직정보` CTA points to `/` instead of the existing Lead entry route.
2. Proxy emits `/login?next=...`, but login/signup ignore `next`; phone inquiry and protected
   Company journeys therefore lose the user's intended destination.
3. Public Company inquiry reaches Support without preserving the source Company identity,
   causing funnel context loss for the requester and operator.
4. Advertisement and Blog internal-link validation accepts backslash paths that browsers
   normalize to cross-origin URLs, creating an open-redirect/link risk.
5. Root metadata has no configured `metadataBase`, while robots, sitemap and Article JSON-LD
   duplicate permissive base-URL fallback logic.
6. The dynamic sitemap reads all public Jobs, Lease posts, Companies and Blog rows without a
   bound, allowing crawler-driven DB and response-size amplification as content grows.

## 4. Required bounded changes

- Preserve only validated same-origin `next` destinations across login and signup; reject
  external, backslash and auth-loop destinations.
- Route the existing Lead CTA correctly and preserve detail-page return paths for phone CTAs.
- Prefill the existing Support funnel with public Company name/ID context; do not add schema.
- Reject browser-normalized cross-origin internal paths in ad and Markdown link contracts.
- Centralize the public site origin and use it for metadata, robots, sitemap and Article JSON-LD.
- Bound one-file sitemap source queries below the 50,000-URL protocol limit and document
  sharding as the threshold action, not an immediate new subsystem.

## 5. Launch blockers

- Code blockers before fixes: open redirect/internal link normalization and broken auth/Lead
  conversion return path.
- No remaining automatic blocker is accepted without focused and full regression evidence.
- Production-only infrastructure items are classified separately and do not stop local gates.

## 6. Monetization gaps and boundaries

- Ads, Lead and Support inquiry funnels already have authoritative persistence and admin views.
- Company inquiry attribution needs only public source context; no CRM/schema is introduced.
- Existing price, discount, credit, quota and unlock policies remain unchanged.
- PG remains intentionally absent under `FREE_ONLY`; paid activation still needs separate
  provider and business approval before the discounted phase.

## 7. Growth and scale audit

- Public lists, Search, Company detail, recommendations, Lead discovery, ad serving and Ops
  delivery use page/batch limits and avoid N+1 public request patterns.
- Sitemap source reads require hard bounds. If any source nears its cap, split it with the
  Next.js 16 `generateSitemaps` contract before adding more indexable rows.
- The legacy all-time Admin Lead KPI timing calculation remains an operator-only growth risk,
  not a 2026-10-01 traffic blocker. Reassess with measured table volume/latency; do not change
  metric semantics without evidence.

## 8. Manual production steps

- Deploy/hosting/DNS/TLS and production environment injection
- Production DB connection, approved `prisma migrate deploy`, backup/PITR and restore rehearsal
- Durable `UPLOAD_DIR` mapping plus restart/backup/restore proof
- Alert destination test-fire
- Telegram bot/webhook/scheduler connection and authorized test-fire if enabled
- DB-backed staging desktop/mobile authenticated journeys
- Search Console submission after production canonical verification
- PG provider and final discount policy before paid activation (not required for free launch)

## 9. Tests

- Focused auth redirect, Proxy, CTA/link safety, Company inquiry and sitemap-bound tests
- Existing auth/company/Lead/ads/support/notification/SEO/launch/observability regressions
- Full Vitest, TypeScript, canonical ESLint, Prisma validate/generate, production build,
  preflight, maintenance smoke and `git diff --check`

## 10. User decision required

`NONE`

No price, quota, discount, PII/publication policy, irreversible migration or business-policy
conflict was introduced by the actual gaps.

## 11. Gate acceptance criteria

| Gate | Acceptance |
| --- | --- |
| 0 | Direct S23 lineage, isolated branch and preserved untracked artifacts proven |
| 1 | Existing inventory and only evidence-backed gaps above are locked |
| 2 | Journeys A-F and auth/invalid/duplicate/permission failures regress cleanly |
| 3 | Ads, Lead and Company inquiry funnels retain attribution, idempotency and admin visibility |
| 4 | Dead CTA, login return, Company inquiry context, canonical/robots/internal links pass |
| 5 | Public queries are bounded; sitemap response risk is capped; build/smoke show no new warning |
| 6 | Existing logging/Ops/recovery contracts pass; production-only rehearsal is explicit |
| 7 | Preflight plus auth/isolation/PII/rate-limit/redirect/error/secret regressions pass |
| 8 | Focused/full/TS/lint/Prisma/build/preflight/smoke/diff checks complete |
| 9 | 10/1 free-launch and later paid-phase manual matrices are separated |
| 10 | Scope/privacy/pricing/schema review, final status and S24 checkpoint are complete |
