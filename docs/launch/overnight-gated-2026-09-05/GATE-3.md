# Gate 3 — Route / link / CTA integrity

HEAD `4f4fe01`, no product changes.

- TypeScript AST scan: 62 App Router page/route definitions, 87 literal JSX
  local href/action references, zero missing targets. Full file/line inventory:
  `static-route-scan.json`. Public files and robots/sitemap included in resolution.
- Runtime source search: no bare href="#" or javascript:void placeholder.
  Two meaningful anchors have targets: main-content and cbt-categories.
- Dynamic public entity builders encode exact Job/Lease/Company IDs; current
  homepage campaign selection resolves eligible public entities, not a generic
  detail fallback. Dynamic/user-generated URLs are outside literal-scan proof.
- Fresh route/search regression: 8 files / 80 PASS (`route-tests.log`).
- Test loop resolves and renders all 102 unique samples, rejects wrong domain,
  unknown/out-of-range IDs, and Production exposure even with override enabled.
  Sample render never calls DAL/API-user/recommendations, generates no real
  counters/tel/form/ad API/support mutation link, and retains disabled notices.
- Missing/hidden real IDs still 404; real Job/Lease canonical metadata uses
  encoded route builder; public Company metadata uses verified public ID.
- Gate 1 build/typecheck/changed lint remains applicable to identical source.

No new P0/P1 confirmed. Gate 2 UX gaps remain SHOULD / MOCKUP WAITING.
Static scan is not proof of all possible runtime links. Production smoke remains
external evidence. No DB/Railway/Production/deploy/push mutation.

Reviewer decision: **PASS**. Verbatim excerpts:

> NONE.
>
> YES — proceed to Gate 4.

Reviewer accepted bounded static + executable regression evidence. Arbitrary
dynamic Production IDs, external navigation/domain/TLS and post-deploy smoke
remain outside this proof. Gate 2 mockup backlog remains unchanged.
