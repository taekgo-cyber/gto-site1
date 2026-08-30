# Production Release Execution Tooling

This runbook describes the repository-side release tools that prepare the first Production ACTIVE ADMIN and the Blog Durability Bundle import. It does not authorize a Production mutation by itself.

## Hard prerequisites

Before any Production DB mutation:

1. Production hosting/project and exact Production PostgreSQL target are designated.
2. Gate 12 Backup/PITR evidence exists.
3. Gate 13 isolated Restore Drill evidence exists.
4. Production schema migration has explicit human approval and has completed successfully.
5. The exact release window has an explicit human approval identifier.

Never use `prisma db seed` to bootstrap Production. The normal seed contains demo/sample data and is not the Production ADMIN bootstrap path.

## Shared fail-closed boundary

Production mutation tooling verifies all of the following before it reaches a Prisma write:

- `NODE_ENV=production`;
- `DATABASE_URL` is PostgreSQL and is not loopback;
- the actual DB hostname exactly matches `--expected-db-host`;
- the actual database name exactly matches `--expected-db-name`;
- a bounded release approval identifier is provided;
- the acknowledgement is exactly `I_ACKNOWLEDGE_BOUNDED_RELEASE_DB_MUTATION`.

Disposable verification uses the same target-identity rules but requires a loopback PostgreSQL target instead of a remote Production target.

## Production ACTIVE ADMIN bootstrap

The password is supplied only through `RELEASE_ADMIN_BOOTSTRAP_PASSWORD`; do not place it in CLI arguments, Git, screenshots, logs, or evidence.

The bootstrap tool never upgrades, repairs, or overwrites an existing account. If the email already exists, it returns `NO_OP` only when email/name/password/role/status/deletion state exactly match the intended ACTIVE ADMIN. Any mismatch is a conflict and stops before mutation.

Example shape only — do not run until the Production release gate is explicitly approved:

```text
RELEASE_ADMIN_BOOTSTRAP_PASSWORD=<secret-store injected value>
npm run production:bootstrap-admin -- \
  --environment production \
  --expected-db-host <exact-production-db-host> \
  --expected-db-name <exact-production-db-name> \
  --email <admin-email> \
  --name <admin-name> \
  --backup-evidence-id <gate-12-evidence-id> \
  --restore-evidence-id <gate-13-evidence-id> \
  --approval-id <human-release-approval-id> \
  --ack I_ACKNOWLEDGE_BOUNDED_RELEASE_DB_MUTATION
```

Completion evidence may record the action (`CREATED` or `NO_OP`), user ID, email, role/status, approval ID, and backup/restore evidence IDs. It must not record password material or a password hash.

## Blog durability Production plan

The Production plan is read-only. It validates the exact target DB identity and canonical HTTPS origin, then runs the existing zero-write durability dry-run. In Production mode the canonical origin must exactly match `NEXT_PUBLIC_SITE_URL`.

### Canonical bundle handoff

Do not make the release depend on an old OS Temp path. Before the Production plan,
the release operator must place a verified Bundle v1 artifact in an
operator-controlled release-evidence location outside the repository and outside
ephemeral Temp storage, or reproducibly rerun the read-only exporter against the
authoritative source database when that source is still available. The artifact
itself is not committed to Git.

For the first launch, verify before use that the selected bundle still matches
the approved canonical characteristics: 10 Articles, `DRAFT` 9,
`PUBLISHED` 1, archived content excluded, and featured/body image references
10/10. Record only the artifact location identifier, file SHA-256, Bundle v1
checksum, article/status counts, exporter source checkpoint, and verification
time in release evidence. Never edit article content to force those counts.

The exporter uses exclusive-create output semantics and performs a second
read-only export comparison before it reports success, so a fresh artifact can
be generated without mutating the source database. If the authoritative source
state has drifted from the approved launch bundle, stop and review the delta
instead of silently replacing the canonical artifact.

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

The resulting `planChecksum` locks together the DB target identity, bundle checksum, ACTIVE ADMIN mapping, canonical origin, dry-run checksum, and expected create/no-op counts.

## Blog durability Production import

The import reruns the entire dry-run immediately before mutation. The newly computed plan must exactly match the human-reviewed `planChecksum`; otherwise it stops with `BLOG_DURABILITY_PLAN_DRIFT` before entering the transaction.

The import additionally requires Gate 12/13 evidence identifiers and the explicit mutation acknowledgement.

```text
npm run blog:durability:production-import -- \
  --environment production \
  --bundle <verified-canonical-bundle.json> \
  --actor-user-id <active-admin-user-id> \
  --target-base-url https://<canonical-origin> \
  --expected-canonical-origin https://<canonical-origin> \
  --expected-db-host <exact-production-db-host> \
  --expected-db-name <exact-production-db-name> \
  --expected-plan-checksum <64-hex-plan-checksum> \
  --backup-evidence-id <gate-12-evidence-id> \
  --restore-evidence-id <gate-13-evidence-id> \
  --approval-id <human-release-approval-id> \
  --ack I_ACKNOWLEDGE_BOUNDED_RELEASE_DB_MUTATION
```

After all release-layer checks pass, the tool reuses the Gate 6 validated transactional core:

- create/reuse Category decisions from the fresh dry-run;
- create missing Articles as `DRAFT` / `publishedAt=null` first;
- transaction-local checksum/relation/image verification;
- final status/publishedAt applied last;
- conflict/drift stops instead of overwrite/reconcile;
- one bounded transaction;
- post-commit read-back verification;
- post-commit mismatch is a critical stop with no blind compensating delete/update.

## Disposable verification

The following verifier is intentionally disposable-only and does not accept a Production mode. It creates a synthetic Bundle v1 and proves `plan(create) -> import -> stale-plan rejection -> plan(no-op) -> import no-op` against an isolated loopback PostgreSQL target.

```text
npm run production:verify-release-tooling:disposable -- \
  --expected-db-host 127.0.0.1 \
  --expected-db-name <disposable-db-name> \
  --admin-email <disposable-admin-email>
```

## Production execution order

The intended mutation order is:

```text
Gate 12 Backup/PITR proof
-> Gate 13 Restore Drill proof
-> explicit human approval for Production migration
-> prisma migrate deploy
-> ACTIVE ADMIN bootstrap
-> Production-target zero-write durability plan/dry-run
-> verify recovery point still valid
-> explicit human approval for durability import
-> guarded Production durability import
-> Production deploy
-> Gate 21 smoke
-> Gate 22 live-origin verification
-> Gate 23 re-verdict
```

Hosting, DB, DNS, deploy, migration, ADMIN bootstrap, durability import, and public traffic switch remain human/external actions. Repository readiness does not constitute execution authorization.
