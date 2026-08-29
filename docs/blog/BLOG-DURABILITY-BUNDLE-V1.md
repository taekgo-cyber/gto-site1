# Blog Durability Bundle v1 Contract

Status: `GATE 3 APPROVED CONTRACT`

This document defines the portable, deterministic contract used to preserve the
ten operating Blog articles before any Production import is attempted. It is a
contract for later export, dry-run, and transactional import gates. Gate 3 makes
no database or Production changes.

## 1. Scope and invariants

- Format identifier: `gto.blog-durability`
- Supported `schemaVersion`: `1`
- Canonical Category identity: `slug`
- Canonical Article identity: `slug`
- Included operating states: `DRAFT`, `PUBLISHED`
- Expected current operating set: 10 Articles (`DRAFT` 9, `PUBLISHED` 1)
- The separate `ARCHIVED` Article is excluded from the v1 operating bundle and
  must be reported by count and slug.
- Source database IDs are provenance only. They are never reused as target
  primary or foreign keys.
- Unknown or future schema versions stop before any write.
- Existing target content is never overwritten or partially reconciled by v1.
- All serialized dates are ISO 8601 UTC strings.
- Secrets, database URLs, credentials, and API keys are forbidden in a bundle.

## 2. Top-level document

The bundle is one JSON document with these required members:

```json
{
  "format": "gto.blog-durability",
  "schemaVersion": 1,
  "exportedAt": "2026-08-29T00:00:00.000Z",
  "source": {
    "environmentLabel": "local-development",
    "branch": "codex/s24-launch-validation",
    "head": "<40-character-git-sha>",
    "exporterVersion": "1"
  },
  "selection": {
    "articleSlugs": ["<sorted-slug>"],
    "includedStatuses": ["DRAFT", "PUBLISHED"]
  },
  "categories": [],
  "articles": [],
  "checksums": {
    "algorithm": "sha256",
    "canonicalization": "gto-stable-json-v1",
    "bundleChecksum": "<64-lowercase-hex>"
  },
  "summary": {
    "categoryCount": 0,
    "articleCount": 10,
    "countsByStatus": { "DRAFT": 9, "PUBLISHED": 1 },
    "featuredImageRefCount": 10,
    "bodyImageRefCount": 10,
    "excludedArchivedCount": 1,
    "excludedArchivedSlugs": ["<sorted-slug>"]
  }
}
```

`articleSlugs`, `categories`, `articles`, and excluded slugs are sorted by slug.
Only Categories referenced by the selected Articles are included. Counts and
selection fields must agree with the arrays; disagreement invalidates the
bundle.

## 3. Category entry

Each Category entry has this shape:

```text
slug: string
name: string
description: string | null
isActive: boolean
sortOrder: integer
source:
  id: string
  createdAt: ISO8601 UTC string
  updatedAt: ISO8601 UTC string
checksum: 64-character lowercase SHA-256 hex
```

The Category semantic checksum payload is exactly:

```text
{ slug, name, description, isActive, sortOrder }
```

The `source` object is provenance only. A missing target slug is a create
candidate. An existing target slug with an equal semantic checksum is reused.
An existing target slug with a different semantic checksum is a conflict and
stops the entire import before writes.

## 4. Article entry

Each Article entry has this shape:

```text
slug: string
title: string
excerpt: string | null
contentMarkdown: string
tags: string[]
categorySlug: string | null
status: "DRAFT" | "PUBLISHED"
publishedAt: ISO8601 UTC string | null
seoTitle: string | null
seoDescription: string | null
featuredImageUrl: string | null
featuredImageAlt: string | null
contentOrigin: "MANUAL" | "AI"
aiGenerationMeta: JSON value | null
imageRefs:
  featured: null | { url: string, alt: string, assetPath: string }
  body: Array<{ url: string, alt: string, assetPath: string, occurrence: integer }>
source:
  id: string
  createdAt: ISO8601 UTC string
  updatedAt: ISO8601 UTC string
  authorRef: null | { sourceId: string }
  automationJobRef: null | { sourceJobId: string }
checksums:
  contentChecksum: 64-character lowercase SHA-256 hex
  stateChecksum: 64-character lowercase SHA-256 hex
```

`tags` remain an ordered JSON string array; there is no separate Tag relation.
`imageRefs` are derived verification data and must agree exactly with the
featured image fields and renderer-supported body Markdown images. Body entries
are in document order and `occurrence` is zero-based.

The current renderer-supported body image form is a complete trimmed line:

```text
![non-empty ALT](http-or-https-URL-without-whitespace-or-closing-parenthesis)
```

Raw HTML images and inline images are not body image references for v1.

## 5. Canonical JSON and checksums

`gto-stable-json-v1` has these exact rules:

1. Input must be JSON-compatible data; non-JSON values are rejected.
2. Object keys are sorted recursively in lexicographic order.
3. Array order is preserved.
4. `null` and an absent member are distinct.
5. Serialization is UTF-8 JSON with no insignificant whitespace.
6. The digest is SHA-256 encoded as 64 lowercase hexadecimal characters.

The Article content checksum payload is exactly:

```text
{
  slug,
  title,
  excerpt,
  contentMarkdown,
  tags,
  categorySlug,
  seoTitle,
  seoDescription,
  featuredImageUrl,
  featuredImageAlt,
  contentOrigin,
  aiGenerationMeta
}
```

It excludes `status`, `publishedAt`, provenance, derived `imageRefs`, and all
checksum fields. It is used for content conflicts, URL-transform verification,
and the transaction's pre-publication read-back.

The Article state checksum payload is exactly:

```text
{ slug, status, publishedAt }
```

It is used only to verify final publication state. Final Article identity
requires both content and state checksums to match.

The bundle checksum is computed over the complete bundle after removing only
`checksums.bundleChecksum`. The `algorithm` and `canonicalization` members remain
in the checksum input.

## 6. Source and transformed target checksums

Export stores checksums for the source payload. Import first validates them,
then performs the approved image URL transformation and computes:

- `expectedTargetContentChecksum` from the transformed content payload;
- `expectedTargetStateChecksum` from the unchanged state payload.

The intermediate DRAFT read-back is compared only with the target content
checksum. The final read-back is compared with the target state checksum and
then with both checksums together. This separation is mandatory because a
PUBLISHED Article is intentionally created as DRAFT before final state is
applied.

## 7. Image reference and URL transformation contract

Images are persisted in two places:

1. `featuredImageUrl` and `featuredImageAlt`;
2. renderer-supported Markdown image lines inside `contentMarkdown`.

Only URLs beginning with the exact source prefix below may be transformed:

```text
http://localhost:3000/images/blog/
```

Import requires a parameterized target base URL. It must be an HTTPS origin
without credentials, query, or fragment. Transformation replaces only the
source origin while preserving `/images/blog/...`, filename, ALT, Markdown
structure, and every non-image character and link.

The importer must reject protocol-relative, `javascript:`, `data:`, `file:`,
malformed, path-traversal, unexpected localhost, and remaining localhost Blog
image references. Dry-run reports each source-to-target URL mapping by Article
slug and occurrence.

Expected canonical operating-set evidence is 10 featured references and 10 body
references, for 20 total. A count or derived-reference mismatch is an error.

## 8. Author policy

Write import requires an explicit `actorUserId`. The target user must pass the
existing ACTIVE ADMIN authorization boundary. Every newly imported Article is
assigned to that target actor.

`source.authorRef` is bundle-only provenance. It contains no email or credential,
is never looked up as a target ID, and cannot silently fall back to another user
or `null`. A missing or invalid target actor stops before writes.

For an existing Article, the target author must already equal the validated
actor for the Article to qualify as a no-op.

## 9. Automation provenance policy

Source `automationJobId` is recorded only as `source.automationJobRef`. The
existing `aiGenerationMeta` JSON remains part of portable content, including any
provenance it already contains.

For v1, a newly imported target Article always has `automationJobId = null`.
The importer does not copy, match, or create a `BlogContentJob`. This avoids
cross-environment unique-key and foreign-key collisions. Dry-run reports the
dropped target relation with preserved bundle provenance. A future relation
mapping requires an explicit later contract version.

## 10. Article idempotency and conflicts

A missing target Article slug is a create candidate. An existing target Article
is `NO_OP` only if all of these conditions hold:

- its transformed content checksum matches;
- its state checksum matches;
- its author equals the validated target actor;
- its `automationJobId` is `null`;
- its Category relation matches;
- its derived featured and body image references match.

Any partial mismatch is `CONFLICT / STOP` before writes. This includes equal
content with a different `status` or `publishedAt`, a different or null author,
a non-null automation relation, or a Category or image-reference mismatch. v1
does not overwrite, reconcile, change only status, reassign an author, or modify
an automation relation on an existing Article.

## 11. Publication state rules

- `DRAFT` requires `publishedAt = null`.
- `PUBLISHED` requires a non-null ISO 8601 UTC `publishedAt`.
- `ARCHIVED` is invalid in the v1 operating Article array.
- A referenced inactive Category makes a PUBLISHED Article invalid.
- Final `status` and `publishedAt` are applied only after content and relations
  have passed read-back.

## 12. Dry-run contract

Dry-run is mandatory and performs zero writes. Its deterministic, slug-sorted
report includes:

```text
bundleValid
wouldWrite: false
categories: create | reuse | conflict entries
articles: create | noOp | conflict entries
authorMapping
automationPolicy
imageTransforms
checksumResults
warnings
errors
expectedBundleArticleCount
expectedBundleCountsByStatus
expectedCreateCount
expectedNoOpCount
expectedCategoryCreateCount
expectedCategoryReuseCount
```

Any validation error or conflict makes the bundle ineligible for write import.
Production-global counts may be informational observations, but they are never
canonical success criteria.

## 13. Transaction and rollback contract

Write mode must rerun the complete dry-run and then use one bounded interactive
Prisma transaction in this order:

1. Create missing Categories and reuse checksum-equal Categories.
2. Create missing Articles as `DRAFT` with `publishedAt = null`, transformed
   content, Category relation, `authorId = actorUserId`, and
   `automationJobId = null`.
3. Read back and verify each content checksum.
4. Verify Category, author, null automation relation, and derived image refs.
5. Apply final bundle `status` and `publishedAt` last.
6. Read back and verify each state checksum.
7. Verify the complete final portable payload, both checksums, relations, and
   image refs.
8. Commit only after every transaction-local check passes.
9. Perform a post-commit read-back.

Any failure through the final transaction-local check rolls back the entire
transaction. A post-commit mismatch is a critical stop requiring a manual
recovery report; the importer must not perform blind compensating deletion or
updates.

## 14. Required read-back

For the bundle scope, verification includes:

- Category count, slugs, semantic payloads, and checksums;
- Article count and slugs;
- title, excerpt, content Markdown, ordered tags, and Category;
- SEO title and description;
- content origin and deep-equal AI generation metadata;
- featured and body image URLs, ALT, paths, order, and counts;
- content checksum and state checksum;
- status and exact `publishedAt`;
- target author equal to the explicit actor;
- target `automationJobId = null`;
- expected bundle state counts (`PUBLISHED` 1, `DRAFT` 9);
- no imported `ARCHIVED` Article.

The post-commit report distinguishes created and no-op records and never uses
the Production database's global Blog counts as the success boundary.

## 15. Gate boundaries

- Gate 3 records this contract only. Production writes are zero.
- Gate 4 implements read-only local export against this exact contract.
- Gate 5 implements a zero-write dry-run importer.
- Gate 6 implements the bounded transactional importer for local/test
  verification only unless a later explicit Production approval is granted.
- Gate 7 implements and verifies the parameterized Production image URL
  transformation.
- Prisma schema or migration changes are not expected and require a separate
  proved need and approval.
