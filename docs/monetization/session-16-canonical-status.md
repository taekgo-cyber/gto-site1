# Session 16 Canonical — Lead + Advertising KPI / Impression / Click / Conversion Analytics

Date: 2026-08-24 (Asia/Seoul)
Branch: `analytics/session-16-canonical`
Baseline: `7c2485e` (canonical S15 PASS)

## Final decision

**S16 GATE 0-7: PASS**

This closeout follows the corrected canonical roadmap:

- S14: advertising/banner system
- S15: advertiser/product/contract management
- S16: Lead + advertising KPI / impression / click / conversion analytics

Blog CMS/content-growth and S17/S19 parallel work are not part of this S16 closeout.

## Gate results

### Gate 0 — S15 baseline: PASS

- Branch opened from canonical S15 checkpoint `7c2485e`.
- S15 advertiser/product/contract lifecycle remained authoritative.
- Existing unrelated untracked CBT/debug artifacts were preserved and not included in S16 scope.

### Gate 1 — analytics contract: PASS

Canonical advertising funnel:

1. **Impression**: an ACTIVE/effective public campaign is actually mounted in `AdPlacementSlot` and the first-party impression endpoint accepts a deduped event.
2. **Click**: the user follows the server-controlled campaign click route; destination is loaded from authoritative campaign data.
3. **Conversion**: a valid attributed click is followed by successful `CandidateLead` activation (`DRAFT -> ACTIVE`). Draft save alone is not a conversion.

Additional contract:

- attribution window: 30 days
- one click can create at most one conversion
- analytics failure must not invalidate successful Lead activation
- analytics storage contains no name/phone/email, raw IP, or raw User-Agent
- client impression dedupe material is SHA-256 hashed before persistence

### Gate 2 — append-only analytics schema/service: PASS

Added enum:

- `AdAnalyticsEventType.IMPRESSION`
- `AdAnalyticsEventType.CLICK`
- `AdAnalyticsEventType.CONVERSION`

Added append-only `AdAnalyticsEvent` with:

- campaign/company/placement snapshots
- event type and occurrence time
- optional hashed dedupe key
- optional opaque attribution token
- optional source click event id
- unique constraints for dedupe/attribution/conversion replay control
- campaign/company/placement/event/date indexes for bounded KPI aggregation

Forward migration:

- `20260824053500_session16_ad_analytics`

Service foundation includes:

- `getTrackablePublicCampaign`
- impression recording with hashed dedupe
- click recording with opaque attribution token
- 30-day attribution validation
- one-click-one-conversion enforcement
- ACTIVE ADMIN-only KPI aggregation
- default recent 30-day aggregation window
- maximum 90-day query range
- finite zero-denominator math

Prisma generate/validate, Next typegen and TypeScript verification passed before later Gates opened.

### Gate 3 — impression and click collection: PASS

Public ad rendering now:

- records an impression only after the client placement mounts
- sends first-party POST to `/api/ads/[campaignId]/impression`
- dedupes the same campaign/page-load event
- does not persist the raw browser dedupe string

Click handling now:

- uses `/api/ads/[campaignId]/click`
- rechecks campaign ACTIVE state, campaign time window, active placement, ACTIVE company, ACTIVE ad product, and uncancelled current company entitlement
- rejects non-trackable campaigns without recording a click
- records the CLICK before redirect
- sets `gto_ad_attribution` as a 30-day HttpOnly, SameSite=Lax first-party cookie
- redirects only to the authoritative sanitized campaign destination

Next typegen, typecheck, changed-source lint and diff-check passed.

### Gate 4 — Lead conversion attribution: PASS

`activateCandidateLeadAction` integration:

1. CandidateLead activation succeeds first.
2. Only then is the HttpOnly attribution cookie read.
3. A recent valid CLICK may create one CONVERSION event.
4. Attribution cookie is consumed after the conversion attempt.
5. Analytics attribution errors are isolated and cannot roll back or report failure for an otherwise valid Lead activation.

Static type/lint/diff verification passed.

### Gate 5 — combined Lead + advertising KPI UI: PASS

`/admin/leads` now presents the canonical S16 dashboard:

Existing Lead metrics retained:

- Lead totals / ACTIVE / period-new count
- Match totals/status/average per Lead
- Contact Unlock totals/average per Lead
- Match -> Unlock conversion
- company breakdown
- first Match/Unlock latency

Advertising metrics added:

- impressions
- clicks
- CTR
- attributed Lead conversions
- click -> Lead conversion rate
- per-campaign breakdown
- per-advertiser/company breakdown
- per-placement breakdown
- explicit numerator/denominator display
- default recent 30-day window
- maximum 90-day bounded range

The authoritative session actor is rechecked server-side as ACTIVE ADMIN.

Typecheck, changed-source lint and diff-check passed.

### Gate 6 — security / privacy / analytics integrity: PASS

Focused verification:

- 4 files / **64 tests PASS**
- new S16 analytics tests: **10/10 PASS**

Verified:

- impression dedupe
- SHA-256 storage instead of raw client dedupe value
- no raw fingerprint/PII fields in analytics writes
- inactive/non-trackable campaign fail-closed
- opaque click attribution token
- forged/expired attribution rejection
- one-click-one-conversion replay prevention
- ACTIVE ADMIN KPI authorization
- zero denominator returns 0, never NaN/Infinity
- campaign/company/placement aggregation
- >90-day analytics range rejection
- existing Lead KPI/hardening regressions
- existing S14 advertising regressions

Typecheck, changed-source lint and `git diff --check` passed.

### Gate 7 — disposable PostgreSQL + full release audit: PASS

Fresh disposable PostgreSQL 16 was used; shared/main DB was not touched.

Migration verification:

- **14 migrations** applied from an empty database
- migration status: up to date
- `ad_analytics_events` columns, unique constraints and aggregation indexes present

Real database E2E:

1. create ACTIVE admin, candidate, advertiser/company and region
2. sync managed advertisement catalog
3. create active placement
4. create current uncancelled advertiser contract
5. create ACTIVE campaign
6. record impression
7. repeat same impression -> duplicate suppressed
8. record click -> authoritative `/mypage/lead` destination + opaque attribution token
9. create real CandidateLead in DRAFT
10. call real `activateCandidateLead` -> ACTIVE
11. record attributed conversion
12. replay same click conversion -> duplicate suppressed
13. aggregate KPI

Observed E2E result:

- impression recorded: yes
- duplicate impression suppressed: yes
- click recorded: yes
- CandidateLead status: `ACTIVE`
- conversion recorded: yes
- duplicate conversion suppressed: yes
- analytics events: 3
- impressions: 1
- clicks: 1
- conversions: 1
- CTR: 1.0
- click-to-Lead conversion rate: 1.0
- per-campaign rows: 1
- per-company rows: 1
- per-placement rows: 1
- raw client dedupe stored: no

Disposable PostgreSQL container was removed after verification.

Final release audit:

- full Vitest: **101 files / 1,150 tests PASS**
- Prisma generate: PASS
- Prisma validate: PASS
- Next.js 16 route typegen: PASS
- TypeScript: PASS
- tracked source lint: **0 errors / 19 pre-existing warnings**
- Next.js 16 production build: PASS
- production route manifest includes both new ad analytics endpoints
- `git diff --check`: PASS

## Scope protection

Not changed as part of canonical S16:

- S17 parallel work
- S19 parallel work
- Blog CMS/content-growth domain
- CBT behavior/data tooling
- Lead pricing/credit contracts
- credit ledger semantics
- live PG/payment/provider integration

Existing unrelated untracked files remain preserved and excluded from the S16 checkpoint.

## Closeout

Canonical S16 is complete. The next sequential roadmap work may start only from this PASS checkpoint after the local commit is recorded. No remote push is part of this closeout unless explicitly requested later.
