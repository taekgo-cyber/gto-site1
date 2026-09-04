# HOMEPAGE PAID INVENTORY FULL-FILL RESULT

## VERDICT

FINAL PASS — local implementation and visual acceptance. Production publication remains a separate release decision.

## Repository State

- Branch: `codex/s24-launch-validation`
- Start HEAD: `0094ab6a44f3533e4061e0087ac71e3319a4238a`
- End HEAD: the commit containing this report; its SHA is recorded in the task's final response.
- Continued the existing uncommitted homepage implementation. No reset, restore, stash, clean or unrelated-file deletion.
- Homepage implementation, relevant policy/tests and these reports are committed together. Pre-existing unrelated untracked files remain outside the commit.

## Inventory Contract

| Placement | Total source inventory | Page A | Page B |
| --- | ---: | ---: | ---: |
| MAIN | 20 | 10 | 10 |
| PREMIUM | 30 | 15 | 15 |
| GENERAL | 40 | 20 | 20 |
| COMPANY | 12 | Left 6 | Right 6 |

Total: 102 unique inventory slots. Desktop tier pages use five columns: MAIN two rows, PREMIUM three rows, GENERAL four rows. Mobile uses two columns and keeps every record available through the page controls.

## Previous Limits Found

- `src/lib/monetization/policy.ts`: old sale capacity MAIN 8 / PREMIUM 20 / GENERAL unlimited / COMPANY 4 per side. Old visible-slot policy MAIN 2 / PREMIUM 6 / GENERAL 6 / COMPANY 1 per side.
- `listHomepageAdvertisementInventory` queried the entire eligible canonical pool, with no homepage SQL `take` cap, but then selected only the visible-slot count before returning the view model. It now returns the complete sale capacity. The existing 30-minute candidate selection window remains independent of the five-second client page timer.
- Campaign activation capacity checks already read the central capacity constant. They now enforce 20/30/40 and 6 per company placement, without changing pricing, credits, quotas, entitlement validity or payment behavior. Existing campaigns are not mutated or deactivated.
- The old fixture generator also truncated to visible slots and generated only small pools. Full fixtures now supply 102 identified synthetic records. Explicit sparse/no-image fixtures remain available for regression checks.
- The UI now groups full source arrays into disjoint pages. The organic list's five-item limit and the separate campaign-target chooser's `take: 100` are unrelated to homepage ad inventory and remain intact. There is no separate public homepage inventory API truncation.

## Sample Inventory

- MAIN samples: 20; PREMIUM: 30; GENERAL: 40; COMPANY: 12; total: 102 when real inventory is empty.
- Local development currently has zero real paid campaigns, so the normal homepage fills all slots automatically without a fixture URL.
- Real records come first; only the missing slots are filled. Verified mixed case: 3/8/15 real tier records plus four real company banners produces 17/22/25 tier samples plus eight company samples.
- Real campaign IDs and job/lease targets are deduplicated across groups, preserving MAIN priority. No real ad is repeated to fill a slot. The merge does not mutate input data.
- `isSample: true` is presentation metadata; synthetic job/lease target IDs are null. Sample companies are explicitly named 샘플운송 / 샘플물류. Regions, tonnage, vehicle, work and pay vary; trailers are 25-ton examples and illustrative monthly amounts vary with tonnage.
- Uses three existing repository-generated WebP editorial assets with crop/position variation. No new dependency, downloaded image or external hotlink.
- Development defaults ON; `ENABLE_HOMEPAGE_SAMPLE_INVENTORY=false` or `0` disables it. Production stays OFF even if this flag or a fixture query is supplied. Only `.env.example` was documented; no actual environment files were changed.

## Rotation

MAIN, PREMIUM and GENERAL use the same disposable pager and controls:

- 5,000 ms A → B → A; previous/next buttons and page indicator.
- Hover and section focus pause independently; leaving hover does not override retained focus.
- Manual navigation and pause release restart a full interval.
- Explicit stop/play button supports mobile reading; reduced-motion disables automatic rotation and keeps manual navigation available.
- Background documents pause; listeners/timers are disposed on unmount.
- Inactive page wrappers use `hidden`/`display: none`, preventing focus and viewable impressions for hidden cards.
- Browser verified arrows for all three tiers, isolated hover pause, focus pause, manual stop and resumed page change after a measured 5.2-second wait. Fake-timer tests cover exact A/B timing, overlap of pause reasons, reduced-motion and disposal.

## Sample Safety

- Actual company impersonation: NO.
- Real phone numbers: NO.
- External ad copy: NO.
- Real billing tracking for samples: NO.
- Production mutation: NO.

All four card types use the same tracking decision. Samples set the viewability tracker to disabled and link directly to `/jobs`, `/lease` or `/companies`, never `/api/ads/...`. The normal filled homepage rendered zero tracked sample URLs. Browser sample selection reached the public jobs list. Real cards retain their original click endpoint and viewability controller. Samples have no persisted campaign, lead, entitlement, quota or KPI writes. No real campaign click/impression mutation was exercised against the local DB; those paths were validated by mocked regression tests.

## Visual Fidelity

- **Desktop:** 1440×900 CSS viewport; five-column paid pages, twelve-company inline horizontal rail, clear MAIN/PREMIUM/GENERAL distinction, no horizontal document overflow.
- **Wide desktop:** 1760×1000 CSS viewport; 164px left rail + 1346px center + 164px right rail, six company cards per side, no document overflow. Monthly inline representation remains available, using the same campaign IDs rather than creating additional inventory. Existing real-impression deduplication covers repeated company placements.
- **Mobile:** 390×844 CSS viewport, two-column tier pages, 44px page controls, all twelve company banners in the horizontal rail. Document scroll width 376px with the browser scrollbar, below viewport width. Visible tier counts remain 10/15/20. No broken loaded images observed.
- Composition preserves header → hero/search → MAIN → monthly companies → PREMIUM → GENERAL → free jobs/lease/services → blog → footer. Red MAIN and orange PREMIUM badges, vehicle/route/pay/company metadata, compact text GENERAL and blue service hierarchy follow the reference.
- BEFORE captured the empty paid homepage; IMPLEMENT/RENDER screenshots exposed full inventory; REFINE replaced the repeated road scene with a truck-loading asset, corrected trailer examples, and calibrated viewport dimensions for the browser's 107% scale. Desktop, wide and mobile screenshots were visually inspected and displayed inline in this task. Screenshots were not exported to standalone files by the available browser API.
- Remaining visual differences: the supplied mockup's highway truck hero and individual advertiser photographs are represented by existing approved editorial images; the new 10/15/20 page contract produces a taller page than the original screenshot. Only one real CMS blog article is published locally, so that row remains sparse. It was not filled with fabricated articles. No pixel-perfect or measured CLS score is claimed.

## Functional Regression

- Search: mobile `5톤` submitted to `/search?q=5톤` and returned four real results.
- Filters: 지입 구인 navigated to `/lease?type=HIRE` and showed the two matching entries.
- Ads: canonical eligibility/ownership/entitlement checks, full-capacity selection, deduplication, real-first merge, sparse rendering and page controls passed.
- Tracking: sample impression/click bypass and retained real endpoints passed; pre-existing page-level viewability deduplication preserved.
- Routing: sample links lead to valid public lists; existing service destinations remain intact. No fabricated sample detail routes.
- Responsive: desktop, wide and mobile behavior verified in the real browser. Free listing exclusions include both real paid pages and never synthetic targets.

## Verification

- Focused homepage/ads: 5 files / 55 tests PASS (`focused-tests.log`).
- Full suite, including relevant monetization and tracking regression: 146 files / 1,492 tests PASS (`tests.log`).
- `npm run typecheck`: PASS (`typecheck.log`).
- `npm run build`: PASS (`build.log`), Next.js 16.3.0 production compilation.
- Changed TypeScript/TSX source lint: PASS, zero errors/warnings (`changed-lint.log`, empty output).
- Global `npm run lint`: pre-existing unrelated debt, 12 errors / 18 warnings (`global-lint.log`); no new homepage lint errors. Lint configuration and unrelated debt files were not changed.
- Browser console: zero captured errors/warnings in the QA tab.
- Screenshots: before, populated desktop, wide rails, mobile top/PREMIUM/GENERAL inspected inline; final loaded images had no failures.
- `git diff --check`: PASS. Conflict-marker scan: zero matches in changed source.

## Commit

Message: `feat(home): finalize paid inventory and sample showcase`.

The resulting SHA is provided in the task's final response. No push or deployment.

## Remaining Release Items

1. Acquire real advertiser campaigns and approved advertiser-specific creatives. Sample replacements happen automatically as real eligible inventory grows.
2. Decide separately whether production will ever expose samples; current production behavior is OFF.
3. Publish more genuine CMS articles to populate the currently sparse blog row; no editorial DB writes were made here.
4. Resolve pre-existing global lint debt in its own scope.
5. Run deployment and live advertiser analytics/billing smoke checks only under a separately authorized release. No production validation is claimed by this local closeout.

## Mutation

Production: 0
Staging: 0
Railway: 0
Database: 0 writes (local read-only browsing; tests mocked)
Deploy: 0
Push: 0
