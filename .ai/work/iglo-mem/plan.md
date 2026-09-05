# iglo.mem delivery plan

Product scope: complete for documented Linux x86_64. All T01–T10 are verified and independently reviewed at `0b9d877`. [Coverage](coverage.md): 294 original source units preserved, 292 verified, 2 user-amended with replacement behavior verified, 0 pending. Final delivery stops at PR readiness; no merge or tagged release requested.

Authority: unchanged [PRD](../../../PRD.md), [accepted amendments](../../specs/accepted-amendments.md). Prior planning/probe states are historical in Git and evidence; the first foundation slice was not full completion. Shared home credentials use ordinary private atomic saves and trust same-user processes. All Markdown follows one block pipeline without hard input limits/fixed overlap. Original non-goals remain: no local models, DB, daemon, alternate provider/search mode, implicit freshness, installed schedules or full-codebase indexing.

## Task states and acceptance evidence

| ID | State | Delivered outcome | Dependencies | Evidence |
| --- | --- | --- | --- | --- |
| T00 | verified | Build/verification environment and pinned Bun available | none | [Preflight](evidence/T00/setup.md); hosted build proof |
| T01 | reviewed | init/config/discovery; shared credentials, hidden setup/reset, environment precedence, cancellation and private atomic saves | T00,D03 | [PTY](evidence/resumed/terminal-ci-fix.json), [35 tests/types](evidence/resumed/checks-ci-fix.txt), [12k concurrent saves](evidence/resumed/concurrent-save-after.json), test/credentials.test.ts |
| T02 | reviewed | Empty prepare/search/status; atomic snapshot, no reader source/API/write side effects | T01,D03 | [CLI](evidence/resumed/cli-ci-fix.json), [downloaded binary](evidence/resumed/downloaded-artifact.json), test/index.test.ts |
| T03 | reviewed | Deterministic Markdown, canonical input hashes, indexed OpenRouter responses, binary vectors and complete publication | T02,D01,D04 | test/chunks.test.ts, test/embedding.test.ts, test/index.test.ts; [live batch](evidence/resumed/live-openrouter.json) |
| T04 | reviewed | Incremental reuse/refresh/deletions/profile isolation, orphan recovery, failed refresh preserves snapshot | T03 | [CLI](evidence/resumed/cli-ci-fix.json), [tests](evidence/resumed/checks-ci-fix.txt), [live unchanged prepare](evidence/resumed/live-openrouter.json) |
| T05 | reviewed | Snapshot-only semantic/lexical ranking, file deduplication, bounded snippets, explicit errors with no fallback | T03,D05 | test/ranking.test.ts, test/index.test.ts; [live ranking/unreadable sources](evidence/resumed/live-openrouter.json) |
| T06 | reviewed | Status without source access/API; reference-safe GC and corrupt authority rejection | T04,T05 | [CLI](evidence/resumed/cli-ci-fix.json), test/index.test.ts; [live status/GC](evidence/resumed/live-openrouter.json) |
| T07 | reviewed | Worktree isolation, bounded OS locks/process-exit recovery, simultaneous commands, committed snapshots and saved-key cron-style preparation | T04,T05,T06,D03 | test/lock.test.ts, test/index.test.ts; [PTY worktree reuse](evidence/resumed/terminal-ci-fix.json), [live no-shell setup](evidence/resumed/live-openrouter.json) |
| T08 | reviewed | Downloadable standalone Linux x86_64 executable with embedded native lock binding | T07,D02 | [CI/downloaded artifact and clean Debian all-five-command proof](evidence/resumed/downloaded-artifact.json); [final verification](evidence/resumed/verify-final.md) |
| T09 | reviewed | Relevant semantic/exact results and <1s local search at10k chunks on measured runner | T05,T08,D05 | [live ranking](evidence/resumed/live-openrouter.json), [100 warm+20 cold-requested runs per dimension](evidence/resumed/performance-summary.json), max524/629ms |
| T10 | reviewed | README setup/privacy/refresh/cron/recovery/install instructions, all acceptance and DoD evidence reconciled | T08,T09 | [coverage](coverage.md), [72 remaining-row audit](evidence/resumed/coverage-audit.json), [final review](evidence/resumed/review-final.md), [README](../../../README.md) |

Every task uses the final cumulative [product verification](evidence/resumed/verify-final.md) and [three-lane review](evidence/resumed/review-final.md); mapped requirement IDs remain in coverage. Test source paths above are repository-root relative. Earlier proof is retained where source is unchanged; final credential and CI harness fixes were reverified and reviewed. No unresolved required finding, check, conflict or repository approval can be skipped at readiness.

## Decision map

| ID | State | Resolution |
| --- | --- | --- |
| D00 | resolved | Preserve all PRD functional scope and explicit snapshot freshness. |
| D01 | resolved by user | No hard length rejection or size classes. One heading/paragraph/code-block pipeline, soft5000 grouping target, intact oversized blocks, no exact overlap. Revised R07-07/08 tested. |
| D02 | resolved for PR | Supported Linux x86_64, verified locally and through hosted downloaded build. PRD names no multi-platform matrix; earlier candidates remain future unverified ports. No tagged release during finish. |
| D03 | resolved and verified | Simple shared outside-Git credential file with private permissions/atomic saves; no adversarial same-user framework. Separate small bundled POSIX directory flock provides index consistency and automatic release. |
| D04 | resolved and verified | Canonical profile/input/content identities, snapshot/receipt/vector validation and safe orphan reuse as implemented and tested. |
| D05 | resolved and verified | Fixed cosine/lexical weights and threshold, stable dedup/order,400-char output excerpts; real-provider ranking and measured end-to-end local latency pass separately. |

Historical design/provisional contracts: [design](../../briefs/iglo-mem-design.md), [research](../../research/prd-feasibility.md), [original slice spec](../../specs/iglo-mem-next.md). Where they conflict, accepted amendments and verified final contract govern. Historical failed feasibility probes are preserved, not treated as current work after the user's clarification.

Delivery: existing PR #1 is ready for review after metadata-head checks passed. No merge/cleanup of this active worktree or user-owned .agent is authorized or needed. No configured release/follow-up hooks. Future ports require their own proof before support claims.
