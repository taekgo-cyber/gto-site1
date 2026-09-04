# Gate 4 — Fresh global validation

Source HEAD: `4f4fe019d9d31ecebc16dcc42ca16651f8422b55`.
No product changes during Gates 0–4.

| Check | Result | Evidence |
| --- | --- | --- |
| Full npm test | PASS, 148 files / 1536 tests | full-tests.log |
| Production build, rerun Gate 4 | PASS | gate4-build.log |
| Typecheck after build | PASS | gate4-typecheck.log |
| Changed-source lint, 14 Auth delta files | PASS, 0 errors / 0 warnings | gate4-changed-lint.log |
| Tracked-source lint, 552 files | PASS, 0 errors / 16 warnings | tracked-lint.log/json |
| Raw npm run lint | Exit 1, 12 errors / 18 warnings | global-lint.log |
| git diff --check | PASS | command output empty |
| Conflict markers in src/prisma/tools TS/TSX/MJS/SQL | 0 | rg exit 1, no matches |
| Auth targeted | PASS, 3 files / 41 tests | auth-tests.log |
| Routing/search targeted | PASS, 8 files / 80 tests | route-tests.log |

Raw lint findings are identical to historical
`docs/launch/homepage-deep-links/global-lint.log`; Compare-Object returned only
one additional blank line. Do not describe raw lint as clean.

All 12 errors belong to existing untracked/ignored root helpers and CBT
operator evidence scripts; the extra two warnings are ignored operator
artifacts. Tracked warnings: seed 1, Blog images 4, storage parameter 1,
CBT tooling 7, provider-probe test 3. Risk classification follows Gate 5.

The first tracked-file CLI invocation exceeded Windows command-line limits.
Installed ESLint Node API then linted the same git ls-files TS/TSX/JS/MJS/MTS
set successfully. No dependencies or lint scope configuration were changed.
Vite's existing tsconfig-paths advisory is tooling follow-up, not a test failure.

Product source, DB, Railway, Production, deploy and push mutations: zero.
Only local evidence and ignored test/build outputs written.
Reviewer: **PASS WITH FOLLOW-UP**. Verbatim excerpts:

> Gate 4에서 product code fix는 NONE.
>
> YES — proceed to Gate 5.
>
> PASS WITH PRE-EXISTING LINT DEBT

Reviewer accepted the fresh evidence and zero regression; requests Gate 5
assessment of all findings and explicit release lint policy. No speculative
cleanup, ignored CBT edits, broad image conversion or rule suppression.
