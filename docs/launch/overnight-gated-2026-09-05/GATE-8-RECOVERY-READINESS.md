# Gate 8 — Backup / restore execution readiness

Local plan ready for review; execution **EXTERNAL APPROVAL REQUIRED**.
Account capability/cost/retention decisions remain **PLAN DECISION REQUIRED**.
Gate 7 current inventory is unverified; no backup or restore was executed.

## Capability evidence vs account evidence

Railway documents volume snapshots with manual/scheduled recovery, and logical
dumps as portable recovery artifacts. Snapshot restore acts on the same service
within its project/environment; it redeploys and can delete newer backups. It
is not the independent safe drill target assumed by old generic instructions.
Daily retention is 6 days, weekly 1 month, monthly 3 months. The repository's
provisional daily-7 policy needs owner resolution, not silent lowering.
[Railway Backups](https://docs.railway.com/volumes/backups)

PITR uses WAL archiving/base backups and recovers into a new sibling service.
Enablement creates storage/configuration and redeploys, so it is a mutation.
Published PITR cost uses storage/egress meters; account eligibility, actual
price, capacity and archive health must be checked before approving it. Do not
assert a Pro upgrade is required or that the current account is ready.
[Railway PITR](https://docs.railway.com/volumes/point-in-time-recovery),
[Postgres recovery guide](https://docs.railway.com/guides/postgres-backups-restores)

The old runbook's fixed PostgreSQL 16 dump/restore assumption was corrected.
Confirm actual source major and tool version; use matching major by default,
with provider-compatible image for physical restore/PITR. A dump tool older
than its server major cannot perform that dump, and downgrade restoration is
not guaranteed. Historical staging 18.6 is not current Production version proof.
[PostgreSQL pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html)

## Execution package — actions require separate approvals

| Step | Prerequisite / action category | Retained evidence | Failure / rollback boundary | Owner approval |
| --- | --- | --- | --- | --- |
| Identify | Current project/env/DB/volume/image + actual server version; read-only | IDs, version, isolation, tool versions | Stop if ambiguous; no guessed target | Authorized operator read access |
| Decide plan | Verify available snapshot/PITR, encryption, access, recovery window, costs; resolve 6-day vs 7-day policy | Selected method, actual retention, RPO/RTO goals, budget | Missing capability => plan decision; no purchase | Owner/ops policy and any spending |
| Establish recovery | Enable approved schedule/PITR and create valid recovery point; back up uploads independently | Backup ID/time/hash, WAL archive health/window where used, upload snapshot ID | Wait for verified completion; do not migrate on an empty/incomplete backup | Exact backup/config/resource mutation |
| Prepare drill | Approve isolated target and compatible image/tool; no public traffic/schedulers | Different target IDs, no shared writable volumes, provider compatibility | Stop rather than restore onto source | Resource creation + restore/data access |
| Restore | Logical restore into empty isolated DB or approved PITR sibling; restore upload copy | Source backup/target IDs and start/end timestamps | Preserve source and backup; retain failed target for diagnosis; no automatic delete/retry | Bounded restore write |
| Validate | Schema + migration history, expected aggregate counts, hash/CBT contract, image paths, health/ready, controlled critical flows | PASS/FAIL, matched counts without PII, measured RPO/RTO | Mismatch => source stays untouched, release blocked | Test scope including any writes approved separately |
| Decide release | Review recovery proof and newest pre-migration point | Approved proof IDs and release SHA | NO VALID BACKUP + RESTORE PROOF = NO MIGRATION/IMPORT/DEPLOY | Separate migration approval only after proofs |

Logical backups must not contain credentials in filenames/arguments/logs.
Use secure injected connection settings and private destinations outside web/Git
roots. Recovering user records requires controlled access; evidence uses counts,
hashes and status only. Preserve backup/source; no Production snapshot rollback
or backup deletion is part of this plan's execution authorization.

RPO <=24h and RTO <=4h are provisional repo targets, not measured achievements.
Owner must accept actual guarantees and drill results. Upload/DB timestamp skew
must be measured through row-to-file consistency checks.

Files changed: this readiness document and two version-sensitive sections plus
Railway clarification in docs/operations/backup-recovery.md. No product code,
schema, dependency or configuration change. Same-source Gate 4 test/build/type
evidence applies; Markdown diff check PASS; conflict marker scan 0.
Reviewer: **PASS WITH FOLLOW-UP**. Verbatim excerpts:

> YES — Gate 9 Release Runbook → Gate 10 Soft Launch Priorities 순서로 진행하십시오.
>
> docs(ops): correct backup and restore compatibility guidance
>
> NO PUSH / NO DEPLOY / NO EXTERNAL MUTATION.

Reviewer explicitly permits a local logical commit for this correction. Actual
version/entitlement/cost, retention decision, approved RPO/RTO and recovery proof
remain external requirements; daily-7 is provisional / PLAN DECISION REQUIRED.
