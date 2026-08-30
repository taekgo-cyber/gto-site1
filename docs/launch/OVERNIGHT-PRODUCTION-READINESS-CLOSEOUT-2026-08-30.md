# OVERNIGHT PRODUCTION READINESS CLOSEOUT — 2026-08-30

Canonical RC baseline at start: `908d2774326fa276df580c25f93dd4138b62f216` on `codex/s24-launch-validation`.

This closeout records only safe pre-Production work. No Production deployment, migration, DB/data mutation, ADMIN bootstrap, durability import, DNS change, public switch, payment, main merge/push, Telegram delivery, AI provider call, or secret rotation was performed.

## Local / Git verification

- Repository: `C:\Users\taekg\gto-site1`
- Branch: `codex/s24-launch-validation`
- Upstream: `origin/codex/s24-launch-validation`
- Starting local/upstream relation: ahead/behind `0/0`
- Starting tracked staged: `0`
- Starting tracked unstaged: `0`
- RC vs local main at start: RC-only commits `38`; main-only commits `0`; main is an ancestor of the RC.
- Existing untracked files were preserved. `.chatgpt2codex/**` remains metadata/evidence and is excluded from commits; unrelated user artifacts remain untouched.

## Verification rerun

No runtime code was changed during this closeout, so the already-PASS Railway staging desktop/mobile E2E was not repeated.

Current RC verification rerun:

- `npm run typecheck`: PASS
- `npx prisma validate`: PASS
- `npm run build`: PASS
- `npm test`: PASS — 138 test files / 1,392 tests

## Node / Railway build hardening decision

`package.json` has no explicit `engines.node` pin. Current Railway staging has already built and redeployed the RC successfully, and the current local Production build also passes. Railway's current Railpack documentation supports zero-configuration Node detection and configurable language versions when needed.

Verdict: **RECOMMENDED BUT NON-BLOCKING**. Do not modify `package.json` merely to add a cosmetic pin before launch. A Node version pin may be added later if Production/staging runtime evidence shows a version mismatch or deterministic rebuild requirement.

## Production infrastructure actual-state

Existing authoritative evidence says the Railway `production` environment has no Production Web App, PostgreSQL service, persistent Volume, Production domain, migration, deploy, or data mutation.

A fresh Railway CLI account-state inspection was attempted but the connector required an additional external approval boundary for network access. Therefore this closeout does not fabricate newer Railway Production state.

Current classification: **EXTERNAL RAILWAY UI/CLI EVIDENCE REQUIRED** before Production infrastructure can be operationally reclassified.

Desired future shell remains:

```text
gto-site1-production / production
├─ gto-web
├─ dedicated PostgreSQL
└─ dedicated persistent Volume -> /data/uploads
```

Safety defaults:

- Production DB != staging DB
- Production Volume != staging Volume
- Production secrets != staging secrets
- `STORAGE_PROVIDER=local`
- `UPLOAD_DIR=/data/uploads`
- scheduler OFF
- Telegram OFF
- `MONETIZATION_ACTIVATION_MODE=FREE_ONLY`
- `SITE_AVAILABILITY=MAINTENANCE`

## Production ENV contract closeout

The canonical Production ENV documentation was expanded so the release contract now explicitly covers the previously under-documented variables.

Classification:

| Variable | Class | Initial launch requirement |
| --- | --- | --- |
| `NODE_ENV` | A/platform-managed config | required = `production` |
| `DATABASE_URL` | B Railway-generated infrastructure reference / secret | required |
| `AUTH_SECRET` | C user-owned/runtime secret | required |
| `NEXT_PUBLIC_SITE_URL` | A non-secret configuration | required only after canonical Production origin chosen |
| `SITE_AVAILABILITY` | A non-secret safety config | required, initially `MAINTENANCE` |
| `LAUNCH_FREE_AT` | A non-secret launch config | required |
| `LAUNCH_PAID_PRENOTICE_AT` | A non-secret launch config | required |
| `LAUNCH_DISCOUNTED_PAID_AT` | A non-secret launch config | required |
| `LAUNCH_STANDARD_PAID_AT` | A non-secret launch config | required |
| `MONETIZATION_ACTIVATION_MODE` | A non-secret safety config | required = `FREE_ONLY` |
| `LEAD_MAX_CONTACT_UNLOCKS_PER_LEAD` | A non-secret policy config | required |
| `STORAGE_PROVIDER` | A non-secret storage config | required = `local` |
| `UPLOAD_DIR` | A non-secret storage config | required = `/data/uploads` with Production volume |
| `BLOG_AI_BASE_URL` | D external provider config | not needed while AI operational smoke is deferred |
| `BLOG_AI_API_KEY` | D external provider credential | not needed while AI disabled |
| `BLOG_AI_MODEL` | D external provider config | not needed while AI disabled |
| `BLOG_AUTOMATION_CRON_SECRET` | C scheduler secret | not needed while scheduler OFF |
| `SUPPORT_ABUSE_HASH_SECRET` | C runtime secret | required; dedicated secret preferred over fallback |
| `OPS_AUTOMATION_CRON_SECRET` | C scheduler secret | can remain unset while Ops scheduler OFF; required before activation |
| `TELEGRAM_BOT_TOKEN` | D external provider credential | not needed while Telegram OFF |
| `TELEGRAM_ADMIN_CHAT_ID` | A operator configuration | not needed while Telegram OFF |
| `TELEGRAM_ADMIN_USER_IDS` | A authorization configuration | not needed while Telegram OFF |
| `TELEGRAM_WEBHOOK_SECRET` | C webhook secret | not needed while Telegram OFF |
| `RELEASE_ADMIN_BOOTSTRAP_PASSWORD` | E temporary release-execution secret | inject only for ADMIN bootstrap, then remove |

No secret value was read, printed, committed, invented, or rotated.

## Gate 11 — Production DB / migration readiness

Status: **MIGRATION READINESS PASS / PRODUCTION EXECUTION BLOCKED**.

- Canonical command remains `npx prisma migrate deploy`.
- Repository migration chain remains 20 migrations.
- Staging PostgreSQL 18.6 has already applied all 20 with pending `0`.
- Existing static scan found no destructive migration pattern requiring a new schema approval.
- Current Prisma validate, typecheck, full regression, and Production build PASS.
- No Production DB exists in current authoritative evidence, so no Production migration was run.

## Gate 12 — Backup / PITR capability

Current Railway documentation (verified 2026-08-30) says:

- Volume backups support manual and scheduled backups.
- Scheduled retention: daily every 24h kept 6 days; weekly every 7d kept 1 month; monthly every 30d kept 3 months.
- Volume-backup restore is within the same project/environment and stages a replacement volume before deploy.
- PITR continuously archives WAL with pgBackRest to a Railway bucket.
- PITR keeps the last 4 full backups, producing roughly a 4-week restore window.
- PITR restore provisions a new sibling PostgreSQL service; the source is not mutated.
- Current Railway docs describe PITR cost through bucket storage and service network egress. They do **not** document PITR as a Pro-only entitlement.

The prior canonical status sentence claiming a paid Pro upgrade is required was therefore corrected. Actual account/UI eligibility must still be verified after a Production PostgreSQL service exists.

Gate 12 verdict: **BLOCKED — PRODUCTION DB + ACTUAL UI/CLI EVIDENCE REQUIRED**.

### No-cost/manual alternative

`pg_dump --format=custom` + secure offsite artifact + checksum + isolated `pg_restore` rehearsal is technically useful and should be retained as a portable logical-backup layer.

Verdict: **NO-COST ALTERNATIVE INSUFFICIENT as the sole Gate 12 replacement** when Railway native backup/PITR is available. It is an additional recovery layer, not a reason to weaken the existing launch safety contract.

## Gate 13 — Restore drill readiness

Status: **PROCEDURE READY / PRODUCTION OPERATIONAL EVIDENCE BLOCKED**.

Required proof remains:

1. valid Production backup/PITR recovery point,
2. isolated restore target,
3. restore completion,
4. migration-history/schema readability,
5. application read-only smoke,
6. representative upload restore/readability,
7. measured RPO,
8. measured RTO,
9. non-secret evidence IDs/timestamps/checksums.

A staging/disposable database compatibility test is not mislabeled as a Production backup restore.

## Production ADMIN bootstrap tooling

Status: **CODE READY / EXECUTION BLOCKED**.

The canonical tooling remains fail-closed and requires:

- `NODE_ENV=production`
- exact non-loopback Production DB identity
- Gate 12 backup evidence ID
- Gate 13 restore evidence ID
- explicit approval ID
- exact mutation acknowledgement
- temporary `RELEASE_ADMIN_BOOTSTRAP_PASSWORD`
- exact existing ADMIN => `NO_OP`
- incompatible existing account => STOP
- post-write/read-back verification

No Production bootstrap was executed.

## Production durability tooling

Status: **CODE READY / EXECUTION BLOCKED**.

The Production PLAN remains read-only and the IMPORT remains guarded by target identity, canonical HTTPS origin, ACTIVE ADMIN mapping, backup/restore evidence, explicit approval, exact acknowledgement, stale-plan protection, transaction boundary, conflict STOP, and post-commit read-back.

No Production plan/import was executed because the Production DB, Production ADMIN, and canonical Production origin are not designated.

## Canonical 10-Article Bundle durability

The approved first-launch characteristics remain:

- 10 operating Articles
- `DRAFT` 9
- `PUBLISHED` 1
- archived row excluded
- featured image refs 10/10
- body image refs 10/10

The old verified bundle location was an OS Temp path, which is fragile for a future release operator. The Production execution runbook was therefore updated so the release must use either:

1. an operator-controlled release-evidence artifact location outside the repository and outside ephemeral Temp storage, or
2. a fresh read-only exporter run against the still-authoritative source DB.

The bundle itself must not be committed to Git. If fresh export state differs from the approved canonical characteristics, STOP and review the delta rather than silently replacing the launch bundle.

## Gate 7 — Production canonical origin

Status: **AUTOMATED TRANSFORMATION PASS / PRODUCTION ORIGIN BLOCKED**.

Do not invent a domain. A Railway-generated domain may be used as an infrastructure endpoint, but it must not silently become the final SEO canonical origin.

Future Production plan shape:

```text
npm run blog:durability:production-plan -- \
  --environment production \
  --bundle <verified-canonical-bundle.json> \
  --actor-user-id <active-admin-user-id> \
  --target-base-url https://<canonical-origin> \
  --expected-canonical-origin https://<canonical-origin> \
  --expected-db-host <exact-production-db-host> \
  --expected-db-name <exact-production-db-name>
```

## Gate 14 — Storage readiness

Status: **CODE READY / STAGING OPERATIONAL PASS / PRODUCTION OPERATIONAL EVIDENCE BLOCKED**.

Reuse the existing staging durable-volume proof. No additional runtime code is required. Production still needs its own dedicated volume mounted at `/data/uploads` and corresponding backup/restore evidence.

## Gate 15 — Monitoring / alerts

Status: **HEALTH/READINESS CODE + STAGING PASS / ALERT TEST-FIRE BLOCKED**.

- `/api/health`: existing staging 200 proof
- `/api/ready`: existing staging 200 proof
- Railway deployment healthcheck may continue to use `/api/ready`.
- A real alert destination and actual test-fire remain required before Gate 15 operational PASS.

No external monitoring signup or notification was performed.

## Gate 18 — AI / scheduler

Status: **CODE READY / CONFIG BLOCKED**.

Initial launch may proceed with scheduler OFF and AI provider credentials absent. Future smoke must remain bounded, DRAFT-only, and no-auto-publish. No provider call was made.

## Gate 19 — Telegram Ops

Status: **CODE READY / CONFIG BLOCKED**.

Initial launch may keep Telegram OFF. Future activation requires bot token, admin chat/user allowlist, webhook secret, authorized webhook smoke, bounded retry/dedupe confirmation, and no real-user messaging during test without explicit approval.

## Gate 20 — Human Production execution package

Hard invariant:

```text
NO VALID BACKUP + RESTORE PROOF
=
NO PRODUCTION MIGRATION / IMPORT
```

Exact future order:

1. verify Production project/environment/service identities,
2. configure Production env with `MAINTENANCE` + `FREE_ONLY`,
3. create/verify Production PostgreSQL and dedicated upload volume,
4. enable/verify backup capability and create a valid recovery point,
5. perform isolated restore drill and retain Gate 12/13 evidence IDs,
6. obtain explicit human approval for Production migration,
7. run `npx prisma migrate deploy`,
8. verify migration read-back / pending `0`,
9. inject temporary ADMIN bootstrap password,
10. run guarded ACTIVE ADMIN bootstrap,
11. remove temporary bootstrap password,
12. place/verify canonical Bundle v1 artifact outside Temp/repository,
13. run zero-write Production durability PLAN,
14. review `wouldWrite=false`, target identity, create/no-op/conflict counts, and `planChecksum`,
15. reconfirm recovery point,
16. obtain explicit human approval for durability import,
17. run guarded Production durability IMPORT,
18. post-commit read-back,
19. obtain RC -> main merge approval,
20. validate main,
21. push main,
22. obtain Production deploy approval,
23. deploy Production while maintenance remains enabled,
24. verify `/api/health`,
25. verify `/api/ready`,
26. Gate 21 Production smoke,
27. Gate 22 live SEO/policy verification,
28. Gate 23 re-verdict,
29. only after GO: separate public-switch approval.

## Main merge readiness

At the starting checkpoint, local `main` had no commits not already contained in
the RC, and the RC had 38 additional commits. A final divergence check also
found that local `main` is already 19 commits ahead of `origin/main`, while
`origin/main` is 0 commits ahead of local `main`. The RC is therefore 57 commits
ahead of `origin/main` and `origin/main` is 0 commits ahead of the RC. Both
`origin/main` and local `main` are ancestors of the RC, so no merge conflict is
currently indicated; however, the future main release must explicitly review
this pre-existing 19-commit local-main/remote-main gap before any `main` push.
Do not treat a local fast-forward as authorization to publish those 19 commits.

No merge, main push, tag, or release was performed.

## Gate 22 — SEO / policy delta

Status: **AUTOMATED PASS / LIVE-ORIGIN + SEARCH CONSOLE BLOCKED**.

Reuse existing PASS evidence for sitemap, robots, canonical logic, Draft/Published visibility, maintenance fail-closed behavior, and `FREE_ONLY`. Live-origin verification and Search Console submission remain deferred until a final Production canonical domain exists.

## Gate 5-23 summary

| Gate | Code/Review | Automated | Staging Evidence | Production Evidence | Status | Remaining Blocker |
| --- | --- | --- | --- | --- | --- | --- |
| 5 | complete | PASS | zero-write dry-run PASS | blocked | PARTIAL PASS | Production DB/ADMIN/origin |
| 6 | complete | PASS | not required for write import | blocked by policy | PASS / LOCAL-DISPOSABLE ONLY | Production import intentionally forbidden here |
| 7 | complete | PASS | transformation verified | blocked | PARTIAL PASS | canonical Production origin |
| 8 | complete | PASS | content state evidence PASS | N/A | PASS | none |
| 9 | delta audit complete | PASS | reused | blocked inputs | PASS WITH EXTERNAL INPUTS | Production inputs |
| 10 | env contract complete | PASS | staging env evidence PASS | blocked | PARTIAL PASS | Production service/secrets/origin |
| 11 | migration readiness complete | PASS | 20 migrations / pending 0 | blocked | PARTIAL PASS | Production DB + human migration approval |
| 12 | contract/research complete | N/A | not Production proof | missing | BLOCKED | Production DB + backup/PITR operational proof |
| 13 | restore procedure complete | N/A | disposable compatibility != restore | missing | BLOCKED | valid Production recovery point + restore drill |
| 14 | storage code complete | PASS | durable upload persistence PASS | missing | BLOCKED | Production volume + backup/restore proof |
| 15 | observability code complete | PASS | health/ready PASS | alert proof missing | BLOCKED | real alert destination/test-fire |
| 16 | complete | PASS | staging readiness PASS | N/A | PASS | none |
| 17 | complete | PASS | desktop/mobile E2E PASS | N/A | PASS | none |
| 18 | code ready | PASS | prior evidence valid | provider smoke missing | CONFIG BLOCKED | AI config only if feature activated |
| 19 | code ready | PASS | prior evidence valid | Telegram smoke missing | CONFIG BLOCKED | Telegram config only if feature activated |
| 20 | execution package ready | PASS | prerequisites partly PASS | mutation not authorized | BLOCKED | Gates 12/13 + Production infrastructure + approvals |
| 21 | code path ready | prior automated coverage PASS | staging E2E not substitute | missing | BLOCKED | human-approved Production deploy |
| 22 | static/automated ready | PASS | staging verification PASS | live origin missing | BLOCKED | final domain + live verification/Search Console |
| 23 | reassessed | PASS locally | strong staging evidence | launch-critical proof missing | **NO-GO** | Production backup/restore/storage/deploy/smoke/origin |

## FINAL GATE 23 VERDICT

**NO-GO**.

The blocker is not an application-code failure. Current local RC is green, staging operational evidence is strong, and Production execution tooling is guarded and ready. Public GO is forbidden because launch-critical Production operational evidence is still absent, especially Gates 12/13, Production DB/storage/origin, alert test-fire, Production deploy, and post-deploy smoke.

## TOMORROW MORNING — USER ACTIONS

### NEXT ACTION 1

Open Railway `gto-site1-production` -> `production` and verify the actual Production environment canvas. Confirm whether `gto-web`, PostgreSQL, and a dedicated Volume exist. If they are still absent, create only the empty Production infrastructure shell with `SITE_AVAILABILITY=MAINTENANCE`, `MONETIZATION_ACTIVATION_MODE=FREE_ONLY`, scheduler OFF, and Telegram OFF. Do **not** run migration/import/deploy traffic/public switch yet.

### AFTER THAT

1. On the new Production PostgreSQL service, open **Backups** and verify manual backup, scheduled backup, and PITR controls actually available to the current account. Do not buy/upgrade a plan merely because the old status doc said Pro was required; current Railway docs do not support that claim.
2. Configure the dedicated Production upload Volume at `/data/uploads` and Production ENV names/secrets without printing secret values.
3. Create a valid Production recovery point, then perform the isolated restore drill and retain Gate 12/13 evidence IDs plus measured RPO/RTO.
4. Only after Gate 12 and Gate 13 PASS, request explicit approval for the Production migration.
5. After migration succeeds, proceed with ADMIN bootstrap -> zero-write durability PLAN -> reviewed checksum -> separate import approval.

Suggested migration approval sentence after Gate 12/13 PASS:

> Gate 12 Backup/PITR and Gate 13 Restore Drill evidence are PASS for the exact Production PostgreSQL target. I approve the bounded Production `npx prisma migrate deploy` step only. Do not perform ADMIN bootstrap, durability import, deploy, public switch, DNS change, or main merge without separate approval.
