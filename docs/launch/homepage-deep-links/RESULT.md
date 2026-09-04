# HOMEPAGE AD DEEP-LINK RESULT

## VERDICT

FINAL PASS — local implementation, browser acceptance and regression gates complete.

## Repository State

- Branch: `codex/s24-launch-validation`
- Start HEAD: `99e1b585f459471a32a76dcc2aeaed713bde4f0e`
- End HEAD: the commit containing this report; the resulting SHA is recorded in the task's final response.
- Started with no tracked modifications. Existing unrelated untracked files remain untouched and outside this commit.
- No reset, clean, stash, rebase, unrelated checkout, schema migration or fake DB insertion.

## Routes Found

| Entity | Existing public route | Identifier |
| --- | --- | --- |
| Job | `/jobs/[id]` | JobPost entity ID |
| Lease / vehicle | `/lease/[id]` | LeasePost entity ID |
| Company | `/companies/[id]` | Company entity ID |

The database generates CUID IDs; no public slug contract applies here. Existing free homepage links and jobs/lease list cards already used these entity IDs and were preserved. Added small shared URL builders for the ad selector, click destination and synthetic inventory; no route directory was added.

## Real Ad Routing

- MAIN / PREMIUM / GENERAL: `RECRUITMENT_LISTING` requires an owned, public Job XOR Lease relation. The homepage view model and click-tracking selector resolve the associated entity ID, not the AdCampaign ID or stored generic link.
- JOB: `/api/ads/[campaignId]/click` → `/jobs/[jobPost.id]`.
- LEASE: `/api/ads/[campaignId]/click` → `/lease/[leasePost.id]`.
- COMPANY: the typed `COMPANY_BANNER` product is a company advertisement. Existing validation explicitly disallows Job/Lease relations on it. Therefore both homepage selection and the tracking destination use `/companies/[companyId]`, even if a stored link is generic or external. Recruitment promotion continues through its Job/Lease relation.
- Existing publication, ownership, company status, product/placement and independent entitlement checks remain. Invalid associations are excluded rather than displayed with a silent list fallback.
- Real impression/click recording, attribution cookies, billing and lead logic were not changed. Legacy ad contracts outside the typed homepage inventory retain their existing behavior.

## Sample Routing

- Sample Job: `/jobs/sample-premium-01`, `/jobs/sample-general-01`, and each sample Job's own stable ID.
- Sample Lease: `/lease/sample-main-01`, and each sample Lease's own stable ID.
- Sample Company: `/companies/sample-left-01` through the matching left/right banner IDs.
- All 102 inventory records have unique detail destinations; the original 20/30/40/12 inventory and A/B grouping remain intact.
- Existing dynamic route handlers recognize the reserved `sample-` namespace, validate exact inventory membership and matching entity domain, and adapt the same synthetic source record into the existing detail view model before any real-detail DAL call.
- Existing Job, Lease and Company presentation was extracted into reusable view components, retaining real detail fields, attachments, phone presentation, owner controls and recommendations. Samples use the same views with a small sample notice, existing local image, descriptive conditions and a disabled inquiry button. No separate sample-only page layout or persistent sample row.
- Production samples remain unavailable, including direct URLs and forged enable flags. Invalid, out-of-range and wrong-domain sample IDs use `notFound()` without falling through to a real lookup. Sample metadata is `noindex, nofollow`.

## Generic Fallback Removed

Previously `createHomepageSample` assigned `/jobs`, `/lease` or `/companies` as every sample's link. It now builds the matching entity detail URL using each sample's stable ID.

Typed company banner destinations previously preferred a stored `linkUrl` before falling back to company detail. The authoritative company relation now determines the destination in both `homepage-ads.ts` and `ads.ts`. Real recruitment already selected actual Job/Lease IDs; tests now explicitly cover all three tiers and both domains through the homepage and tracking selectors.

The homepage preview notice now says that selection opens an individual sample detail. Back-to-list links inside detail pages and section-level “more” links remain intentionally navigational list links.

## Sample Safety

- Billing: bypassed; no real campaign or entitlement is created.
- Tracking: the existing common sample tracking bypass remains; no impression observer or click endpoint is used for samples.
- Lead mutation: none; sample CTAs are disabled and render no inquiry form, telephone link or submission target.
- DB write: none; sample routes do not invoke real detail services, view counters, author phone lookup or recommendations. Shared application chrome may perform ordinary read-only session queries.
- Sample Company does not display the real “reviewed company” label. It is explicitly labeled as a sample company and sales preview.

Real Job detail normally increments views through a client action; real Lease detail normally increments views in `getPostDetail`. To fulfill read-only browser QA, an opt-in server-only `ENABLE_READ_ONLY_DETAIL_PREVIEW=true` development flag suppresses these two counters. The service option defaults to recording views and preserves visibility/ownership checks. Production ignores the flag. No actual `.env` file was edited; only `.env.example` documents it. The dev server was temporarily started with this process environment for QA and restored to its normal mode afterward.

## Browser QA

Actual card clicks on `http://127.0.0.1:3000`:

| Source | Destination | Displayed entity / result |
| --- | --- | --- |
| MAIN sample | `/lease/sample-main-01` | 1톤 윙바디 · 고정 노선; 샘플운송 001, 서울 → 충청, 350만원; PASS |
| PREMIUM sample | `/jobs/sample-premium-01` | 25톤 카고 · 택배; 샘플운송 021, 세종 → 광주, 1,300만원; PASS |
| GENERAL sample | `/jobs/sample-general-01` | 2.5톤 카고 · 센터 간 운송; matching sample title and conditions; PASS |
| Monthly company banner | `/companies/sample-left-01` | 샘플운송 091; explicit sample-company introduction and disabled inquiry; PASS |
| Free latest Job | `/jobs/cmsn4yzw000357wrobty2riwv` | 인천항 → 대구 40피트 컨테이너 운송; PASS |
| Free latest Lease | `/lease/cmsn519br0032xgroztazdpxe` | 1톤 카고 지입 기사 구인 (인천); PASS |

- `/jobs` and `/lease` list cards were also clicked and reached the same actual detail entities.
- Browser back returned to a usable homepage. A full homepage reload can reset carousel state and resume automatic rotation; persistent back-navigation state is not claimed. The pager now initializes from preserved page/pause refs when effects reconnect to retained component state, avoiding a mismatch between its internal page and displayed page.
- A GENERAL test initially read a card immediately before a page change, so the positional click selected a different visible record. Inspection confirmed that destination matched the selected record. The verified retry used the observed exact href and matched the expected title.
- Sample notices, disabled CTA, absence of forms/telephone links and working images checked in rendered detail pages. Zero broken loaded images and zero captured console errors/warnings in the final QA session.
- Screenshots of sample Lease, Job and Company detail were inspected inline. No broad visual redesign was performed.

Read-only local SQL checks before and after browser tests returned identical values:

| Counter | Before | After |
| --- | ---: | ---: |
| Job viewCount sum | 1389 | 1389 |
| Lease viewCount sum | 25 | 25 |
| Ad analytics events | 0 | 0 |
| Candidate leads | 0 | 0 |

Real paid inventory remains empty locally. Real ad entity/redirect destinations were validated through mocked canonical selection and analytics regression rather than generating live paid events.

## Verification

- Targeted routing/homepage/jobs/posts/company/analytics: **14 files / 202 tests PASS** (`focused-tests.log`).
- Full suite: **147 files / 1,509 tests PASS** (`tests.log`).
- All 102 sample destinations resolved and rendered using their existing detail view; exact domain/ID validation, production denial, metadata, tracking bypass and mutation-path exclusion tested.
- Real Job and Lease entity resolution tested for MAIN, PREMIUM and GENERAL; company relation tested against generic, unrelated and external stored URLs.
- Missing real IDs retain existing 404 behavior. Read-only preview does not expose drafts or suppress production counters.
- `npm run typecheck`: PASS (`typecheck.log`).
- `npm run build`: PASS (`build.log`), Next.js 16.3.0.
- Changed-source ESLint: PASS, zero errors/warnings (`changed-lint.log`).
- Global lint: unchanged pre-existing **12 errors / 18 warnings** (`global-lint.log`); no new changed-source debt.
- `git diff --check`: PASS after normalizing log whitespace. Conflict marker scan: zero.

## Commit

`fix(home): deep-link ads to public detail pages`

The commit SHA is provided in the task's final response. No push or deployment.

## Mutation

- Production: 0
- Staging: 0
- Railway: 0
- Database: 0 writes
- Deploy: 0
- Push: 0
