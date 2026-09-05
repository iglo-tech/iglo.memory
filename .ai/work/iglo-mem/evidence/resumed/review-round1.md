# Resumed independent review round 1

Base: 12f3514c91ae138f0c7c4729224c4279065b278f
Head: 002cc56d0b6cac9db9724f684cc69e8205c47236
Status: CHANGES_REQUESTED; all three lanes terminal.

Standard: CHANGES_REQUESTED; BLOCKER src/credentials.ts:17. Ordinary repositories
rooted at ~/.config or ~/.config/iglo.mem are missed because location() checks
only home and its ancestors. Static read/save path proves plaintext saved keys
can land inside a Git repository. No race needed. Fix final destination ancestry;
add nested credential-directory repository tests. Inspected all production,
native/build/QA/test/docs and current intent. Diff whitespace passed; referenced
31-test/247-assertion and product verification evidence, did not rerun tests.

Gilfoyle: CHANGES_REQUESTED; MAJOR same location and trigger. Independently
reproduced saveCredential succeeding inside disposable ~/.config Git worktree.
Ran cached Bun suite: 31 tests/247 assertions PASS, diff whitespace PASS.
Inspected full original-base cumulative diff and verification. No telemetry
configured; runtime telemetry NOT_RUN. No source/tracker changes by reviewer.

Preserve severity disagreement: Standard classified BLOCKER, Gilfoyle MAJOR.
Both findings are the same defect; neither verdict is replaced by the other's.

Both reviewers leave live-provider/relevance, other release-platform and full
end-to-end performance proof open. Product remains partial. No final approval.

Ponytail: CHANGES_REQUESTED; MAJOR same containment defect at credentials.ts:17.
Independently reproduced ordinary ~/.config Git repository accepting a saved
dummy credential and cleaned its fixture. Full cumulative implementation,
native/scripts/tests/docs/contracts/evidence reviewed. Whitespace PASS; recorded
product evidence inspected, full suite not rerun. No extra complexity finding;
small native index-lock binding and dependency footprint justified. Open live
provider/end-to-end latency/other platforms retained. Reviewer changed no files.

Resolution: new regression failed on reviewed source (containment-before.txt).
Move marker traversal start from home to the application credential directory.
Regression covers .config and iglo.mem repositories, both .git directory and
gitfile markers, saved reads/saves, preserved bytes, env bypass and real CLI
CREDENTIALS_INVALID behavior. Product verification rerun before second review.
