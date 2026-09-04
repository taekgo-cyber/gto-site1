# Gate 6 — CBT operator artifact durability plan

HEAD `4f4fe01`. Content in Git: NO. Metadata/checksums in Git: YES.
Local verification PASS; external durability NOT PROVEN / APPROVAL REQUIRED.

## Verified recovery set

| Artifact | Existing ignored location | SHA-256 of exact bytes |
| --- | --- | --- |
| Canonical Bundle v1 | data/cbt/evidence/launch-closeout-80/exact-80-source-bundle-final-a.json | a575586f05f8daaba6b3ade80f1701f97e7d1b8522f9425a8d7edde4851692e8 |
| Frozen manifest | data/cbt/evidence/launch-closeout-80/exact-80-launch-manifest.json | cbe0bb62d986ff0e1d7dc08bd643ff914037382ff7f3503a36e23e1f48ba6872 |
| Manifest byte checksum | exact-80-launch-manifest.json.sha256 beside manifest | Matches manifest bytes above |
| Verification contract/code | tools/cbt/source-handoff/README.md, types.ts, operator-artifact.ts, bundle-v1.ts | Version by Git HEAD |

The bundle is the minimum restorable source graph. Retain the frozen manifest
and approval/review provenance privately for audit as well; inspect any additional
provenance for personal/secret data before approved storage. Old v1-a/v1-b bundles
are not canonical replacements. Do not delete them during this closeout.

Semantic manifest checksum:
`dd07ebcf5ab9d38c30438e125033e078cf165c53acfd4c27c38d24614d48ebbb`.
Deterministic bundle checksum:
`fe45f65e10ae004c4a8ace3cc931cf47aaf9fdefe2e15e12b28836ecfb51847e`.
This bundle checksum excludes exportedAt; the exact-byte hash does not.

Existing verifyOperatorArtifact returned: 80 Candidate, 80 Generated, 80 Master;
four categories of 20; excluded 92477 absent; replacement 92582 and replacement
master present; dataMinimization PASS; dbWrite false. See cbt-artifact-verified.log.
No question/choice/answer/explanation/source rows were printed or shared.

The documented tsx CLI failed before validation with Windows
uv_os_get_passwd / ENOMEM. The identical tracked verifier was successfully loaded
through installed Vite ssrLoadModule, without modifying it or adding dependencies.
This proves artifact integrity; ordinary CLI portability still needs an operator
rerun in the intended execution environment. No DB connection was involved.

## Proposed durable storage contract — not executed

Choose an owner-approved private artifact system supporting immutable/versioned
objects and controlled retention, or an enterprise immutable backup repository.
Require restricted readers, encryption, retention policy, a redundant copy in
a separate failure domain, object version IDs, and an independently tested
retrieval path. Select provider/region/cost/retention with the owner; do not create
storage, enable lock, upload, buy a plan or change access automatically.

Suggested content-addressed namespace after approval:
`cbt/launch-exact-80-manifest-v1/fe45f65e.../`.
Record store identity/version/retention/backup/retrieval evidence privately;
repository ledger may contain non-secret identifiers and hashes only.

## Exact operator sequence after separate approval

1. Confirm the source paths and both SHA-256 values with Get-FileHash. STOP on
   mismatch. Do not regenerate or silently replace a canonical artifact.
2. Run `npm run cbt:source-handoff:validate -- --bundle <existing-private-bundle>`.
   Require the semantic and bundle checksums, 80/80/80, category 20 each,
   exclusion/replacement and minimization PASS. Resolve CLI runtime failure before
   operational use; a failing command must not be called PASS.
3. Approve the exact private destination, allowed data, retention/access, cost
   and redundant backup scope. Upload unchanged bundle/manifest plus reviewed
   provenance using the approved storage interface. Record immutable version IDs.
4. Retrieve the approved versions into a private directory outside Git/public
   web roots, independently of the original local files. Recompute exact-byte
   hashes and rerun the same validator. A successful upload alone is insufficient.
5. Repeat retrieval from the redundant copy. Record date/operator/version IDs,
   checksums and validation result, with no source content or credentials.
6. Only then close external durability. Retrieval/validation is not permission
   for a database import or publication.
7. The existing preflight/import tools target approved tunneled STAGING only.
   Never relabel Production to bypass their guard. Production source import or
   publication requires its own reviewed implementation/plan and explicit approval.

Rollback: before approved upload failure, keep original local artifacts untouched;
on retrieval/hash failure, stop and retain evidence, never overwrite canonical
files or repair content automatically. No external storage mutation in this run.

Reviewer: **PASS WITH FOLLOW-UP**. Verbatim excerpts:

> Local MUST FIX: NONE.
>
> YES — external storage execution을 APPROVAL REQUIRED로 defer하고 Gate 7로 진행하십시오.

CLI portability is SHOULD follow-up; never regenerate canonical content to fix
the loader issue. Durable COMPLETE requires approved store/version/retention,
independent retrieval and separate-failure-domain proof. Production remains blocked.
