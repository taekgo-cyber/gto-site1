# HOMEPAGE MOCKUP-TO-CODE RESULT

## VERDICT

BLOCKED — final visual acceptance only. Safe local implementation and regression verification are complete; the reference's inventory density cannot be reproduced within the locked business policy and current approved content. No commit was made.

## Visual Reference

- Attached Homepage Mockup used: YES.
- Treated as visual source of truth: YES.
- Reference: `C:/Users/taekg/Downloads/1000010518(1).png`.
- Audit → implementation → rendered comparison → refinement completed in the actual localhost browser.

## Repository State

- Branch: `codex/s24-launch-validation`.
- Start HEAD: `0094ab6a44f3533e4061e0087ac71e3319a4238a`.
- End HEAD: `0094ab6a44f3533e4061e0087ac71e3319a4238a`.
- Start tracked tree: clean. Pre-existing unrelated untracked files were preserved.
- Tracked changes: 12 modified homepage/advertising/shared layout files.
- New implementation/test files: 8 (homepage stylesheet, Brand, 5 home components, 1 integration test).
- Staged changes: none.
- Additional evidence: this report, tests.log and build.log.

## Before Audit

1. Three-level 154px desktop header instead of the reference's thin single row.
2. Solid navy hero with a separate driver photo instead of a continuous truck visual.
3. MAIN card occupied almost an entire content rail; PREMIUM cards were oversized.
4. Corporate banners started below the hero and had a different shape.
5. No horizontal monthly banner section.
6. Large dark lease section duplicated the lower organic lease list.
7. Services appeared before GENERAL instead of alongside the free lists.
8. No homepage CMS article row.
9. GENERAL used tall cards instead of compact text rows.
10. Oversized spacing, shadows and rounded corners throughout.

## Implementation

| Section | Implementation |
| --- | --- |
| Header | Thin blue-branded header, retained existing route/navigation and account actions, disclosure search using the unchanged shared GET search form. No invented community route. |
| Hero/Search | Continuous approved local truck image, reference headline, integrated search, existing four quick-filter destinations, keyword search chips, navy panel showing the actual remaining list counts. No fake membership or conversion statistics. |
| MAIN | Compact red-badge image cards with title, route, pay, metadata and company. Selected inventory is unchanged; MAIN remains capped at 2. |
| Monthly Banner | Horizontal corporate creative row using existing selected inventory and the existing 5-second carousel. |
| Premium | Six compact image cards with orange badges, lower prominence than MAIN. |
| General | Three-column compact text rows on desktop, stacked on mobile. No images. |
| Right Rail | Corporate rail aligned with hero/MAIN; lower consultation, CBT, company registration and guide CTAs use valid existing destinations. |
| Free Listings | One job list and one consolidated lease list; excludes the selected paid IDs through the existing DAL contract. Up to five each; NEW only for genuinely recent dates. |
| Services | Compact icon grid of six existing services; no nonexistent calculator, store, map or app links. |
| Blog | Up to six records from listPublishedBlogArticles, preserving published CMS slugs and approved image URLs. No articles invented from asset filenames. |
| Footer | Compact navy footer with shared brand, existing service links and online support. No invented phone number or email. |
| Mobile | Stacked lists/services, scrollable ad rails and chips, image/text layouts and typography adjusted at 390 × 844. |

Missing advertisement creative retains company identification with a labeled “운송 참고 이미지” using an existing local asset. Creative URLs remain unchanged when supplied. Production fixture gates and ad tracking APIs remain unchanged. The development homepage fixture now uses trackingEnabled=false, consistent with the existing dedicated fixture page, so sample IDs are not sent into production-style analytics. Real inventory keeps tracking enabled. Repeated corporate placements share the existing campaign/page impression deduplication controller.

## Fidelity Assessment

Desktop (1440 × 1000):

- Overall composition: main/right-rail structure and reference order implemented.
- Density: NOT ACCEPTED. Locked slot counts and sparse local CMS inventory leave substantial unused area.
- Typography: compact section/title hierarchy, Korean body text and restrained brand colors implemented.
- Cards: separate MAIN/PREMIUM image treatments and GENERAL text rows implemented.
- Images: approved local assets reused, cropping refined; the exact reference hero and corporate creatives are not available.
- Right rail: proportions and placement implemented; current selected inventory provides only two company cards.
- Advertisement hierarchy: distinct and legible, but does not reproduce the reference's number of visible ads.

Mobile (390 × 844):

- Tested actual search submission, quick-filter navigation and banner arrows.
- No document-level horizontal overflow; internal rails intentionally scroll.
- Long Korean title fixture remains within the viewport.
- No broken rendered images in the checked final states.

## Remaining Gap

1. Policy in src/lib/monetization/policy.ts fixes visible slots to MAIN 2, PREMIUM 6, GENERAL 6, COMPANY_LEFT 1, COMPANY_RIGHT 1. The reference shows substantially more. This policy was not modified.
2. Actual local homepage has 0 eligible paid advertisements and only 1 published CMS article. Empty ad sections correctly collapse. No DB content was created or modified to fill the reference.
3. Existing approved hero imagery differs from the reference's highway truck photograph; fallback and fixture creatives are visibly different.
4. The reference's membership/success statistics, app store buttons, Kakao/community links and unavailable tools were not fabricated.
5. Quick filters retain existing link behavior; keyword chips use integrated text search, not newly invented structured filters.
6. CLS was not numerically instrumented. Image sizes/aspect ratios are reserved and carousel controls overlay their rail to avoid adding a control row after hydration.
7. Live campaign click/impression writes were not executed. Actual inventory was empty and database mutation was prohibited. Their contracts were checked through the existing tests and rendered tracked URLs.
8. Browser hover-only behavior was not isolated; the unchanged hover/reduced-motion policy passed unit tests. Focus pause and automatic resume were directly observed in the browser.

The user's stop condition applies: a major density/asset gap remains and resolving it would require changing locked policy or adding approved content outside this local UI scope. Therefore no FINAL PASS or commit.

## Functional Regression

- Search: mobile “5톤” form submission reached /search?q=5톤 and displayed 4 real results; header search opened and closed correctly.
- Filters: “지입 구인” reached /lease?type=HIRE, with the selected HIRE filter and 2 results.
- Ads: selected inventory counts and eligibility/collapse preserved; tracked URLs asserted in integration tests.
- Carousel: next/previous monthly-banner controls moved scrollLeft between about 1 and 159px on mobile. Focus retained the position through more than one interval; releasing focus allowed advancement after about 5 seconds.
- Tracking: existing ad analytics/viewability tests passed, including shared campaign deduplication.
- Routing: existing service destinations retained; local sample fixture detail URLs are test-only and were not represented as real campaigns.
- Responsive: checked 1440px desktop and 390px mobile, actual empty inventory, full fixture and long-title fixture.

## Verification

- Focused existing homepage tests: 3 files / 30 tests PASS.
- Added integration tests: 1 file / 3 tests PASS (empty placements, paid-ID exclusions/tracked links, CMS article provenance).
- Full tests: 145 files / 1,470 tests PASS. See tests.log.
- npm run typecheck: PASS.
- npm run build: PASS. See build.log.
- Changed-file ESLint: PASS.
- npm run lint: FAIL on existing unrelated files, 12 errors and 18 warnings. Errors are in pre-existing check-env scripts and data/cbt/evidence/launch-closeout-80 TypeScript evidence files. No homepage change caused a lint error. Prohibited CBT/unrelated files and lint configuration were not changed.
- Final fresh browser tab: 0 console errors/warnings, 0 broken images, no horizontal document overflow.
- Earlier transient HMR missing-CSS errors occurred while the new stylesheet was being created; absent in the final fresh session.
- Screenshots: before, initial implementation, refined desktop, mobile, lower-page and final full-page states inspected inline in this task.
- git diff --check: PASS after normalizing new EOF whitespace.
- Conflict-marker scan of changed source: none.

## Commit

None. Visual acceptance is blocked and repository-wide lint remains failing on existing out-of-scope files. All implementation files remain unstaged for review.

## Mutation

Production: 0
Staging: 0
Railway: 0
Database: 0 intentional writes (read-only local content queries; fixture analytics disabled)
Deploy: 0
Push: 0

No Prisma/schema/migration, CBT, authentication/security policy, pricing, billing, environment secrets, deployment configuration or unrelated dashboard code changed.
# Historical report

This is the preserved initial mockup closeout. Its capacity/empty-inventory blockers were superseded by the user's later authorized full-inventory contract and resolved in [the paid inventory closeout](../homepage-inventory/RESULT.md).
