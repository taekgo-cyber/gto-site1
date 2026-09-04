# Gate 5 — Individual lint debt assessment

HEAD 4f4fe01. Raw lint: 12 errors / 18 warnings, all pre-existing. No new product defect.

| # | Location | Finding | Category | Assessment |
| --- | --- | --- | --- | --- |
| 1 | check-env-pattern.js:1:1 | error / @typescript-eslint/no-require-imports | C — local helper | Untracked CommonJS helper; not product import; preserve. |
| 2 | check-env.js:1:1 | error / @typescript-eslint/no-require-imports | C — local helper | Untracked CommonJS helper; not product import; preserve. |
| 3 | data/cbt/evidence/launch-closeout-80/build-exact80-manifest.ts:79:44 | error / @typescript-eslint/no-explicit-any | C/F — ignored operator artifact | Historical CBT evidence script; preserve frozen artifact, do not clean to alter lint totals. |
| 4 | data/cbt/evidence/launch-closeout-80/build-promotion-scope.ts:17:35 | error / @typescript-eslint/no-explicit-any | C/F — ignored operator artifact | Historical CBT evidence script; preserve frozen artifact, do not clean to alter lint totals. |
| 5 | data/cbt/evidence/launch-closeout-80/build-review-evidence.ts:25:33 | error / @typescript-eslint/no-explicit-any | C/F — ignored operator artifact | Historical CBT evidence script; preserve frozen artifact, do not clean to alter lint totals. |
| 6 | data/cbt/evidence/launch-closeout-80/build-review-evidence.ts:110:16 | error / @typescript-eslint/no-explicit-any | C/F — ignored operator artifact | Historical CBT evidence script; preserve frozen artifact, do not clean to alter lint totals. |
| 7 | data/cbt/evidence/launch-closeout-80/sample12-hidden-closeout.ts:37:19 | warning / @typescript-eslint/no-unused-vars | C/F — ignored operator artifact | Historical CBT evidence script; preserve frozen artifact, do not clean to alter lint totals. |
| 8 | data/cbt/evidence/launch-closeout-80/sample12-hidden-closeout.ts:37:39 | warning / @typescript-eslint/no-unused-vars | C/F — ignored operator artifact | Historical CBT evidence script; preserve frozen artifact, do not clean to alter lint totals. |
| 9 | data/cbt/evidence/launch-closeout-80/verify-approval.ts:31:53 | error / @typescript-eslint/no-explicit-any | C/F — ignored operator artifact | Historical CBT evidence script; preserve frozen artifact, do not clean to alter lint totals. |
| 10 | data/cbt/evidence/launch-closeout-80/verify-exact80-manifest.ts:49:49 | error / @typescript-eslint/no-explicit-any | C/F — ignored operator artifact | Historical CBT evidence script; preserve frozen artifact, do not clean to alter lint totals. |
| 11 | data/cbt/evidence/launch-closeout-80/verify-exact80-manifest.ts:56:37 | error / @typescript-eslint/no-explicit-any | C/F — ignored operator artifact | Historical CBT evidence script; preserve frozen artifact, do not clean to alter lint totals. |
| 12 | data/cbt/evidence/launch-closeout-80/verify-law-replacement-approval.ts:12:51 | error / @typescript-eslint/no-explicit-any | C/F — ignored operator artifact | Historical CBT evidence script; preserve frozen artifact, do not clean to alter lint totals. |
| 13 | data/cbt/evidence/launch-closeout-80/verify-law-replacement-approval.ts:27:35 | error / @typescript-eslint/no-explicit-any | C/F — ignored operator artifact | Historical CBT evidence script; preserve frozen artifact, do not clean to alter lint totals. |
| 14 | data/cbt/evidence/launch-closeout-80/verify-law-replacement-approval.ts:27:59 | error / @typescript-eslint/no-explicit-any | C/F — ignored operator artifact | Historical CBT evidence script; preserve frozen artifact, do not clean to alter lint totals. |
| 15 | prisma/seed.ts:432:15 | warning / @typescript-eslint/no-unused-vars | D — test/tooling debt | Unused loop index; sample itself still used; seed not executed. |
| 16 | src/app/admin/blog/[id]/preview/page.tsx:44:39 | warning / @next/next/no-img-element | E — legacy optimization | Valid img rendering/alt; potential performance improvement without measured launch blocker. |
| 17 | src/app/blog/[slug]/page.tsx:90:35 | warning / @next/next/no-img-element | E — legacy optimization | Valid img rendering/alt; potential performance improvement without measured launch blocker. |
| 18 | src/app/blog/category/[slug]/page.tsx:76:21 | warning / @next/next/no-img-element | E — legacy optimization | Valid img rendering/alt; potential performance improvement without measured launch blocker. |
| 19 | src/components/blog/MarkdownArticle.tsx:183:15 | warning / @next/next/no-img-element | E — legacy optimization | Valid img rendering/alt; potential performance improvement without measured launch blocker. |
| 20 | src/lib/storage/local.ts:21:40 | warning / @typescript-eslint/no-unused-vars | E — adapter signature | Disk backend does not use MIME argument; MIME stored in DB and served by attachment route. |
| 21 | tools/cbt/batch/gate2-closeout-evidence.ts:20:3 | warning / @typescript-eslint/no-unused-vars | D — test/tooling debt | Unused tooling symbol; no proved runtime bug; defer. |
| 22 | tools/cbt/batch/gate2-closeout-evidence.ts:21:3 | warning / @typescript-eslint/no-unused-vars | D — test/tooling debt | Unused tooling symbol; no proved runtime bug; defer. |
| 23 | tools/cbt/batch/gate2-closeout-evidence.ts:38:10 | warning / @typescript-eslint/no-unused-vars | D — test/tooling debt | Unused tooling symbol; no proved runtime bug; defer. |
| 24 | tools/cbt/batch/gate2-closeout-evidence.ts:323:16 | warning / @typescript-eslint/no-unused-vars | D — test/tooling debt | Unused tooling symbol; no proved runtime bug; defer. |
| 25 | tools/cbt/batch/gate2-closeout-promotion-guard.ts:6:10 | warning / @typescript-eslint/no-unused-vars | D — test/tooling debt | Unused tooling symbol; no proved runtime bug; defer. |
| 26 | tools/cbt/batch/gate2-integrity-evidence.ts:933:9 | warning / @typescript-eslint/no-unused-vars | D — test/tooling debt | Unused tooling symbol; no proved runtime bug; defer. |
| 27 | tools/cbt/cli-gate2-closeout.ts:17:3 | warning / @typescript-eslint/no-unused-vars | D — test/tooling debt | Unused tooling symbol; no proved runtime bug; defer. |
| 28 | tools/cbt/cli-provider-probe.test.ts:24:7 | warning / @typescript-eslint/no-unused-vars | D — test/tooling debt | Unused tooling symbol; no proved runtime bug; defer. |
| 29 | tools/cbt/cli-provider-probe.test.ts:25:7 | warning / @typescript-eslint/no-unused-vars | D — test/tooling debt | Unused tooling symbol; no proved runtime bug; defer. |
| 30 | tools/cbt/cli-provider-probe.test.ts:26:7 | warning / @typescript-eslint/no-unused-vars | D — test/tooling debt | Unused tooling symbol; no proved runtime bug; defer. |

A (proved Soft Launch runtime risk): none. B (proved actual bug): none identified.
The unused preManifestHash at gate2-integrity-evidence.ts:933 is redundant:
snapshot/baseline/identity hashes and frozen target validation remain active below it.
Do not infer a missing security check solely from that unused local.

Release lint policy proposal: retain raw exit1 honestly; tracked-source zero errors
and changed-source zero errors remain required. Do not suppress rules or rewrite
ignored evidence. Reviewer: **PASS WITH FOLLOW-UP**.

Verbatim excerpts:

> NONE before Sept 12, 현재 evidence 기준.
>
> YES — proceed to Gate 6.
>
> 0 Soft Launch MUST lint fixes / documented pre-existing local-artifact debt

Follow-up: verify actual release/CI/deploy pipeline does not require raw lint
exit 0. Repository has no .github workflow or Railway/Nixpacks/Railpack config
found; package build is next build without a lint step. Remote pipeline settings
remain unverified and must be checked before release. If raw lint is a hard gate,
reopen the operational blocker; do not hide it by loosening rules.
