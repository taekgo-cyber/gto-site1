# Gate 2 — Non-visual P1 triage

HEAD unchanged: `4f4fe01`. Product changes: NONE.
Current source inspected; missing historical Muse report was not reconstructed
from guesses. Gate 1 validation applies to unchanged product source.

| Candidate | Current evidence | Proposed classification |
| --- | --- | --- |
| Detail to public company | Job header company name is plain text; detail DTO lacks company ID/public eligibility. Lease author is not a proven public company relation | A/C: open, detail mockup plus relationship/eligibility policy |
| No phone explanation | Both views and PhoneInquiry hide absent contact. Existing comment documents this behavior; samples have separate disabled notice | A/C: open UX gap, reviewer policy decision |
| Filtered list return | Detail back href is bare /jobs or /lease; filters/page not passed into detail | A/C: open, list/detail context contract and mockup |
| Search query naming | Jobs q/region, Lease keyword/regionId, unified q; each form matches its parser | C: no proven broken contract; preserve existing naming |
| Auth return | Gate 1 fresh validation | D: CLOSED |
| Paid generic fallback | Real ad selection uses exact entity ID and public route builder | D: CLOSED; Gate 3 tests next |
| Sample safety | Exact ID/domain before DAL; production denial; separate disabled notice; no sample mutation form/tel | D: baseline intact; Gate 3 regression next |
| Other dead CTA | None in inspected detail/company/phone/sample flows | Gate 3 wider scan |

Inspected files: JobPostDetailView, LeasePostDetailView, PublicCompanyDetailView,
PhoneInquiry, Job/Lease route pages and DAL projections, filters/list parsers,
UnifiedSearchForm, public-detail-links, sample-details, SampleDetailPreview,
homepage-ads entity resolution.

No independent confirmed logic defect was identified in this triage. Items
1–3 remain open, not reported fixed. Submitted to reviewer for MUST/SHOULD and
mockup boundary classification. Reviewer: **PASS WITH FOLLOW-UP**.

Verbatim decision excerpts:

> NONE at Gate 2.
>
> YES — proceed to Gate 3.

Accepted backlog: DETAIL-COMPANY-CROSSLINK, DETAIL-NO-PHONE-STATE and
DETAIL-FILTER-RETURN are each SHOULD / MOCKUP WAITING, not Soft Launch MUST.
SEARCH-PARAM-NAMING is NO ACTION unless a functional defect is proven.
Do not invent author/company relations or add ad-hoc query propagation.
If absent phone produces a misleading active contact CTA elsewhere, promote
that actual defect to P1. Gate 3 must check dead links, canonical routes,
wrong-domain samples, mutation boundaries and obvious static 404 mistakes.
