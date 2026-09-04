# Gate 10 — Soft Launch open items

Target: **2026-09-12 Soft Launch**, subject to owner-approved operating policy.
This is not a change to the October 1 FREE boundary in current example/fallback.
Current Production verdict: **NO-GO**. Local source validation is green with
documented pre-existing lint debt. Review source HEAD 4f4fe01, docs checkpoint 0113e31.

## MUST before actual release

| ID | Item | Category / owner | Acceptance evidence |
| --- | --- | --- | --- |
| M1 | Current Railway inventory and isolation | EXTERNAL OPERATOR ACCESS / ops | Authorized current project/env/web/DB/version/volume IDs and distinct staging resources; not Aug 30 assumptions |
| M2 | Sept 12 Soft vs Oct 1 FREE policy | OWNER DECISION / product owner | Define available operations and four ordered KST boundaries; approve actual Production env without changing examples by inference |
| M3 | Recovery capability, cost and retention | OWNER DECISION + EXTERNAL APPROVAL / owner+ops | Actual entitlement/version, selected backup/PITR, provisional daily7 vs provider6 decision, approved budget/RPO/RTO |
| M4 | Valid DB and upload recovery + isolated restore | EXTERNAL APPROVAL / ops | Recovery IDs, independently restored compatible target, schema/count/hash/file checks, measured RPO/RTO; before migration/import/deploy |
| M5 | Current RC staging delta, 21 migrations | EXTERNAL APPROVAL / release+ops | Latest homepage migration and auth/deep-link delta validation, actual pending status and critical desktop/mobile journeys |
| M6 | Production env/pipeline/preflight applicability | OWNER DECISION + EXTERNAL APPROVAL / release+ops | Required names/presence, canonical HTTPS origin, MAINTENANCE/FREE_ONLY, optional services OFF, raw-lint hard-gate check, reviewed optional-feature preflight FAIL disposition |
| M7a | CBT canonical recovery and Production source/publication | EXTERNAL APPROVAL + scoped engineering review / CBT owner+ops | Private immutable canonical bundle retrieval/checksum proof; content stays outside Git; separately reviewed Production source import/publication; no STAGING guard bypass |
| M7b | Blog bundle and upload durability | EXTERNAL APPROVAL / Blog owner+ops | Approved Blog bundle/image retrieval and checksum proof; guarded Blog plan/import and persistent image storage; does not authorize CBT publication |
| M8 | Final remote reconciliation and exact release | EXTERNAL APPROVAL / release owner | Fresh remote refs/delta and auto-deploy effects reviewed; separate merge/push approvals; no unknown local-main publication |
| M9 | Bounded Production migration/bootstrap/import/deploy | EXTERNAL APPROVAL / release+ops | Each exact target/checksum/proof/approval ID; 21-migration status; approved deployed SHA; no demo seed |
| M10 | Controlled desktop/mobile smoke, live SEO/TLS/tracking | OWNER DECISION + EXTERNAL APPROVAL / QA+ops | Approved maintenance-safe access/exposure window, real critical flows, canonical/robots/sitemap, no sample tracking pollution |
| M11 | Monitoring alert receipt and canonical Gate 23 | EXTERNAL APPROVAL / ops+release owner | Actual alert test receipt, all MUST proofs, explicit GO then separately approved public traffic switch |

No source-code defect is currently designated MUST FIX by reviewer. This does
not imply the operational MUST items above are complete. If evidence reveals
a new actual bug, reopen the relevant Gate and validate a minimal correction.

## SHOULD

- DETAIL-COMPANY-CROSSLINK: verified public company relation/eligibility and
  agreed UI placement, never infer a company from author/name.
- DETAIL-NO-PHONE-STATE: clear absent-contact explanation in detail CTA design.
- DETAIL-FILTER-RETURN: define safe list/filter/page context with Detail/List V2.
- CBT validator CLI portability: rerun the ordinary tsx command in the intended
  operator environment. Same tracked verifier already validated the local bundle.
- Legacy image optimization and unused tooling warnings only with concrete
  benefit and small scope; no blanket refactor before launch.

## MOCKUP WAITING — no overnight Build

- Lease Detail Visual V2
- Job Detail Visual V2
- Jobs Listing Visual V2
- Lease Listing Visual V2
- Lead Management Visual V2
- Ads Management Visual V2

The three detail UX SHOULD items above belong to these later design lanes.
Status: **MOCKUP REQUIRED — DEFERRED UNTIL USER PROVIDES VISUAL REFERENCE**.

## CAN WAIT

- Search parameter naming unification: each current form/parser agrees; NO ACTION
  unless a functional failure is proven.
- Untracked helper/ignored CBT evidence lint cleanup; preserve original artifacts.
- Optional AI/scheduler/Telegram activation while launch keeps them OFF.
- Paid PG activation and pricing refinements while FREE_ONLY remains enforced.
- Broader homepage redesign and unrelated optimization without measured need.

## First task tomorrow — exactly one

**Collect current Production inventory through the normal authorized Railway UI.**
The CLI cannot resolve the home directory in this execution context. Current
resource identities/version/isolation unlock the backup, restore, environment
and deployment decisions; local code has already passed fresh verification.
This task is read-only and does not authorize creation, upgrade or deploy.

Reviewer: **PASS WITH FOLLOW-UP**. Verbatim excerpts:

> YES — proceed to Gate 11.
>
> A local documentation-only commit is permitted after those checks PASS.
>
> NO PUSH / NO DEPLOY / NO DB / NO Railway mutation.

Reviewer approved priorities and tomorrow's single read-only inventory task.
Requested refinement applied: M7a CBT and M7b Blog remain distinct in artifacts,
content policy and publication/import approval. Production NO-GO, Gate 7 APPROVAL
REQUIRED, dates OWNER POLICY DECISION REQUIRED and mockup boundaries retained.
Individual execution steps are in
[the release runbook](GATE-9-RELEASE-RUNBOOK.md).
