# Gate 9 — Production release runbook

Prepared 2026-09-05 KST. **PLAN ONLY / PRODUCTION NO-GO**.
Source baseline `4f4fe019d9d31ecebc16dcc42ca16651f8422b55`; recovery-document
checkpoint `0113e31427c0f46289224c93512d7798db9a2ed8`.
Overnight Gates 0–11 do not renumber canonical Final Launch Gates 6–23.

## Current facts and prerequisites

- Local full suite 148 files / 1536 PASS; type/build PASS; tracked-source lint
  zero errors / 16 warnings; raw local lint 12 errors / 18 warnings unchanged.
- Current migration chain has **21 migrations**, including
  `20260831010000_homepage_monetization_v3`. Old staging 20/pending-0 evidence
  predates this migration and is not proof of the current deployment schema.
- At 0113e31, cached upstream RC comparison is behind/ahead 0/7 and cached
  origin/main comparison is 0/67. No fetch was performed; remote may have moved.
- Current Production inventory unavailable (Railway home-directory failure).
- Canonical CBT local artifact verified, but durable external retrieval unproven.
- Production source-CBT transport/publication is not authorized by the existing
  STAGING-only handoff. It needs a separate implementation/readiness review if
  current target lacks the canonical source graph. Do not weaken its guards.

## Decisions that must be resolved before execution

1. **Soft Launch date contract**: user target is 2026-09-12; local/test fallback
   and .env.example free-launch boundary are 2026-10-01. These may represent
   different launch phases. Before free business operations on Sept 12, owner
   must confirm intended four ordered KST boundaries and public availability.
   PRELAUNCH yields operationsAvailable=false. Do not silently change dates or
   copy October examples into Production. Production requires explicit boundaries.
2. **Disabled optional features vs preflight**: production:preflight currently
   unconditionally checks Blog AI/provider and Blog/Ops cron secrets. Launch
   documentation allows those features OFF. A raw FAIL is not a PASS; retain
   each result and obtain a reviewed applicability decision before release.
   Do not inject dummy secrets, enable services, or suppress checks to turn green.
3. **Remote pipeline**: confirm source branch/SHA, build/start/predeploy commands,
   raw lint gates and auto-deploy triggers before any future push/merge. A push
   that triggers staging/Production deploy requires authorization for that effect.
4. **Recovery**: actual DB version, entitlement, budget, daily-6/provider vs
   daily-7/provisional policy, RPO/RTO and valid restore proof remain unresolved.

## Execution sequence — no action below was executed overnight

Every approval is bounded to exact target/action/window. A runbook is not approval.

| # | Step / action category | Prerequisite | Required evidence | Failure / rollback | Owner approval |
| --- | --- | --- | --- | --- | --- |
| 1 | Final Git reconciliation / read-only fetch+diff | Authorized network; inspect auto-deploy configuration | Current remote/local SHAs, exact delta, clean intended files, no content/secrets | Stop on unexpected divergence; no reset/rebase/force | Read access; merge/push separately approved |
| 2 | Select RC and pipeline | Step 1; reviewed changes and validation; approve trigger effects | Exact source SHA, commands, migration release-step ownership, lint decision | Do not publish until effects known | Release owner |
| 3 | Identify/isolate Production shell | Current Railway identity/canvas; no guessed resources | Env/web/DB/volume IDs, actual DB version, separate secrets/volumes from staging | Ambiguity => STOP; no accidental staging reuse | Creation/config/cost only when explicitly approved |
| 4 | Set safety/env/origin contract | Owner date/policy/domain decisions; exact resources | Names/presence only; MAINTENANCE, FREE_ONLY, AI/schedulers/Telegram OFF, persistent /data/uploads, HTTPS canonical origin | Keep maintenance; no placeholder secret/public origin | Bounded environment configuration |
| 5 | Establish DB+upload recovery point | Capability/retention/cost/permission decisions | Backup IDs/time, archive health/window where used, upload backup and access | Failed/incomplete backup => STOP | Backup/PITR/config mutation approval |
| 6 | Isolated restore drill | Step 5 + compatible empty target, no writable source sharing | Restore IDs, schema/history/counts/checksums/images/health, measured RPO/RTO | Preserve source/recovery point; failed drill blocks migration | Restore/resource/data access scope |
| 7 | Validate current RC in staging if delta requires it | Approved isolated staging, 21-migration delta and exact source | Current desktop/mobile critical journeys and schema status; old 725a3cf evidence marked historical | No Production substitution; failed staging => fix/review | Separate staging deployment/migration/test-write approval |
| 8 | Refresh pre-migration recovery proof and migrate | Steps 3–7 proof; 21 migrations reviewed; target identity reconfirmed | Approved `prisma migrate deploy`, migration status/pending0, timestamp and source SHA | No db push/migrate dev/seed; no automatic reverse SQL; keep maintenance | Production migration only |
| 9 | Bootstrap ACTIVE ADMIN | Migration PASS + valid backup/restore + exact guarded target | CREATED/NO_OP, non-secret actor identity, proof/approval IDs | Conflict STOP; no account overwrite or secret in logs | Separate bootstrap approval |
| 10 | Durable Blog/CBT artifacts | Canonical checksum + independently retrieved private copies | Artifact IDs/hashes/counts; CBT Gate6 proof; Blog approved source bundle/image set | No Temp-only source; drift => review; no canonical regeneration | Storage transfer and any content changes separately approved |
| 11 | Production data plans then bounded imports | Migration/admin/backup proof; actual target/origin; reviewed tooling | Blog zero-write planChecksum and create/no-op/conflict counts; separately reviewed CBT source/publication plan | STAGING CBT importer cannot target Production; conflict/drift STOP | Each DB import/publication separately approved |
| 12 | Final branch/main integration and remote publish | Exact RC + trigger effects approved; validations apply | Approved merge/push SHAs and remote read-back; reviewed full local-main delta | No force push; no automatic repair | Separate merge/push and triggered deploy approvals |
| 13 | Web deployment under maintenance | Recovery/schema/content/env proof; approved SHA, migration hook reviewed | Deployment ID/SHA, health/ready, volume persistence | Maintenance retained; compatible prior app rollback only by approval | Production deploy approval |
| 14 | Production desktop/mobile smoke | Health/ready available under maintenance; separately approved controlled public-smoke access plan | Auth return, company/lease/lead, CBT exam/answer secrecy, uploads, device results | Current proxy blocks public paths in maintenance: do not silently set PUBLIC; if safe bounded window unavailable, STOP | Exact smoke exposure and any test writes |
| 15 | Tracking + live SEO/domain/TLS validation | Approved smoke access/origin | Real entity links, approved test event attribution, no sample pollution, canonical/robots/sitemap, TLS | Mark unproved integration; no fake GO or sample events | Test events/DNS changes separately approved |
| 16 | Monitoring / alert test-fire | Real endpoints + approved destination | Alert delivered/received, health/readiness and error/backup monitoring | Missing receipt => release blocked; no real customer messages | Explicit alert/test recipient approval |
| 17 | Canonical Gate 23 decision | All MUST proofs/current RC; no unresolved launch blocker | Release owner GO/NO-GO with evidence IDs and remaining risks | Any blocker => NO-GO | Final release decision |
| 18 | Public traffic switch and observation | GO + rollback plan + exact origin/TLS | Explicit switch approval, live probes, monitoring observation | Revert traffic/maintenance only through approved incident procedure | Separate PUBLIC/DNS switch approval |

## Operational references

- [Environment contract](../../operations/production-environment.md)
- [Guarded ADMIN and Blog tooling](../../operations/production-release-execution-tooling.md)
- [Recovery plan](GATE-8-RECOVERY-READINESS.md)
- [CBT artifact/restore plan](GATE-6-CBT-DURABILITY.md)
- [Current inventory gap](GATE-7-PRODUCTION-MATRIX.md)
- [Canonical Gate definitions](../FINAL-LAUNCH-ROADMAP.md)

New runbook has no secret values, source CBT content or personal records.
Database/Railway/backup/restore/deploy/push mutations this run: zero.
Gate 9 reviewer: **PASS WITH FOLLOW-UP**.

Verbatim excerpts:

> 현재 즉시 code fix는 NONE.
>
> YES — proceed to Gate 10.
>
> OWNER POLICY DECISION REQUIRED

Reviewer makes current remote/triggers, Production inventory/isolation,
backup+restore, migration 21 staging delta, migration approval, launch-date
policy, optional-feature preflight policy, Production CBT path, controlled
smoke and domain/TLS/alerts MUST before actual release. No code/config date
change or artificial preflight PASS is authorized by this review.
