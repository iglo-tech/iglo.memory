# Resumed finish audit

Status: NEEDS_HUMAN
PR: #1 (link: https://github.com/iglo-tech/iglo.memory/pull/1)
Delivery: PARTIAL. Do not merge or mark the whole PRD complete.
Reviewed implementation: f061341a61c5e7414fc1ad0db9ecfa34f13a34bf.
Original base: 12f3514c91ae138f0c7c4729224c4279065b278f.

Delivered implementation: all five commands; simple shared home credentials
with environment precedence, hidden reset and atomic private saves; uniform
Markdown blocks with no local length rejection/exact overlap; incremental
OpenRouter transport, content-addressed float32 vectors, atomic snapshots,
snapshot-only ranked search, status and reference-safe GC; OS-released locks.

Verification: 33 tests/279 assertions and strict types PASS. Real CLI journeys
with controlled transport, PTY setup/reset/cancellation/restoration, source and
snapshot preservation, concurrent processes and clean Debian standalone checks
PASS. Verification reports and raw results remain in this directory.
Standard/Gilfoyle/Ponytail all PASS after current product verification. Their
one static credential bug and severity disagreement remain preserved; it was
reproduced, fixed and reverified. No current code finding remains.

Performance: final 10,000-chunk compiled-CLI runs PASS at both 1,536 and 3,072
dimensions: 100 warm and 20 cache-eviction-requested runs each. Exact hardware,
raw samples, maxima, fixture scope and binary digest are in performance-summary.json
and referenced files. All include startup and local transport processing;
remote response is controlled, so this is not live-provider relevance proof.
The earlier larger-vector failure and its fix remain recorded.

Coverage: 220 source-unit rows verified in the recorded Linux/controlled scope;
2 requirements superseded by the user, with revised behavior tested; 72 pending
full acceptance. All 294 stable IDs preserved. frontier.json enumerates pending
rows. T01–T07 reviewed within recorded environment, T08–T10 retain full external/
release/integrated acceptance. Do not turn this implementation into full PRD
completion based solely on tests or review PASS.

Provider audit: PR remains OPEN/draft, MERGEABLE/CLEAN; no reported checks,
required branch checks, rulesets or provider approval. No CI failure/conflict
exists to repair; no extra gate introduced. Repository moved to iglo.memory;
canonical PR and workflow tracker updated. No merge requested or performed.
No release/follow-up hooks configured; no release published. Retain the branch,
worktree and local binary for the pending live QA. No remote messages sent.

Exact next action: user configures an OpenRouter key locally with this worktree's
dist/iglo.mem init, then reports configured. Availability check found neither
environment nor saved credential; no value was exposed. Run one small disposable
fixture document batch and two real search queries, verify semantic paraphrase/
exact-term behavior, response integrity, saved-key reuse and resulting snapshot.
No key should be pasted into chat. Audit remaining coverage after live proof;
retain other candidate-platform gaps explicitly (only Linux x86_64 verified).
Reverify/review if live evidence requires code changes, then finish at readiness.

Read-only retro lessons saved in retro.md; its COMPLETE is only report status.
No production source changed after the reviewed implementation revision.
