# Gate 1 — Auth return verification

Baseline/current HEAD: `4f4fe019d9d31ecebc16dcc42ca16651f8422b55`.
Product changes: NONE. Existing Auth commit was verified, not rewritten.

## Evidence

- Fresh targeted tests: 3 files / 41 PASS (`auth-tests.log`). Includes DAL
  anonymous/expired redirect, query preservation, safe normalization,
  wrong-role notFound and Lead authorization, and proxy coverage.
- Fresh production build PASS (`build.log`); typecheck PASS (`typecheck.log`).
- All 14 Auth commit source files: ESLint zero errors/warnings (`auth-lint.log`).
- `git diff --check`: PASS.
- Current Next 16 local redirect/proxy/auth documentation read before work.

Ten protected paths were requested on localhost with no cookie and with a
locally signed, already-expired synthetic session (20 probes). No secret or
cookie value was logged. The expired synthetic subject cannot authenticate;
all requests terminate at authentication before application data access.

Paths: notifications with page; lease/write; lease/placeholder/edit; cbt/my;
mypage; mypage/lead with page/pageSize; company/apply; company/ads with companyId;
company/leads with companyId/leadId/page; company/operations with
companyId/page/filter. All preserve pathname and query key/value pairs.

`auth-http-smoke.log` retains the initial header-only check's five false negatives.
`auth-http-smoke-verified.log` records 20/20 PASS after verifying Next streaming
redirect meta tags and comparing query pairs independent of ordering. Lease
write/edit use HTTP 200 plus `__next-page-redirect`; other probes use HTTP 307.
This is documented Next behavior, not a product defect or a suppressed failure.

## Source review

- requireUser(returnTo) uses buildLoginUrl -> normalizeAuthRedirect.
- Notifications keeps page; mypage/lead keeps page/pageSize; company ads keeps
  companyId; operations keeps companyId/page/pageSize/filter/leadId; company
  leads keeps documented discovery keys and leadId. Transient banners omitted.
- Anonymous proxy retains raw query as it did before; expired-session DAL uses
  the allow-list. Login/signup and auth actions normalize next again.
- Wrong-role denial remains notFound; Lease owner checks unchanged.
- Real login form submission was not exercised; action normalization was
  inspected, helper roundtrip and denial were tested, expired redirects used HTTP.

No database, Railway, Production, deployment or push mutation. Review submitted
to the Gate 0 review conversation. Reviewer decision: **PASS**.

Verbatim reviewer excerpts:

> None required to pass Gate 1.
>
> NONE.
>
> Do not modify the Auth implementation further based on this Gate.
>
> Do not create another Auth commit merely to record verification.
>
> YES — proceed to Gate 2.
>
> IMPLEMENTED + FRESHLY VERIFIED + CLOSED

Real-account browser login and full suite are acceptable deferred evidence;
full suite belongs to Gate 4. Retain initial and corrected HTTP logs.
