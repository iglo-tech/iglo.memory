# Resumed product verification

Risk: HIGH (shared credentials, persisted index and GC).
Status: VERIFIED for the implemented Linux behavior below.
Full PRD delivery: PARTIAL; external release/quality proof remains open.
Authority: user D01/D03 reply and ../../../../specs/accepted-amendments.md.
Snapshot: accompanying implementation commit; exact revision is pinned by review.

Scenario: init → prepare → search/status → unchanged prepare → failed refresh →
source deletion → snapshot-only search → empty refresh → gc. Real source CLI
with a trusted controlled fetch fixture uses the production entry/transport/
store/ranker. Native compiled binary exercised through PTY and a clean Debian
container with network disabled. Independent reads verify credential modes/
bytes, repository absence, source hashes and snapshot preservation.

Checks:
- sh scripts/check.sh: tests and strict TypeScript PASS after fixing a nullable assertion in the concurrent-save test; checks.txt records counts.
- sh scripts/build.sh: standalone executable PASS, embedded lock addon.
- python3 scripts/qa-terminal.py: PASS; terminal.json records hidden entry,
  reset/cancel/EOF, restored terminal state, saved reuse in linked Git worktree,
  startup isolation and all five commands with PATH=/nonexistent.
- python3 scripts/qa-clean.py: PASS; clean-machine.json pins Debian image digest.
  No Bun/Node/npm/Git or source addon mounted; all commands pass offline.
- bun scripts/qa-cli.ts under trusted startup: PASS; cli.json records request
  kinds/counts, redaction, source-independent search, failure preservation/GC.
- Native process test: bounded contention, different-root independence, SIGKILL
  release and zero lockfile writes PASS. Concurrent command processes and
  concurrent credential atomic saves pass in the suite.
- Fixtures cover 18,000-code-point intact blocks, canonical source exclusions,
  line normalization/locations, 64+1 batches, response reordering/validation,
  permanent/transient errors and Retry-After, orphan reuse, missing/corrupt
  vectors, schema/path validation, profile incompatibility, and ranking ties/
  identifiers/file deduplication/top-eight/no-match behavior.
- Filesystem denial tests reproduce failed credential and snapshot publication;
  old bytes survive and completed orphan vectors are reusable.

Gates: implemented-Linux-product=PASS; module/type=PASS; CLI=PASS; PTY=PASS;
clean-Linux-executable=PASS; controlled-API-contract=PASS; integrity=PASS.
GUI/ux-proof=SKIPPED (terminal product, direct PTY evidence); lint/coverage-
threshold/mutation/complexity tools=NOT_CONFIGURED. No extra tool gate added.
Live OpenRouter/relevance=NOT_RUN: no OPENROUTER_API_KEY configured; no real
credential or API budget supplied. Mocks do not prove real-provider semantics.
Other release targets=NOT_RUN: this run has a Linux x86_64 environment only.
Performance=partial evidence: initial local 10,000-chunk samples at 1,536 and
3,072 dimensions passed under one second; full raw runs collected separately.
Benchmark uses controlled query vectors and excludes real HTTP transport and
process startup, so it is not full external/end-to-end latency proof.

Coverage owners: T01 I01–I12 and revised ordinary-storage I13; T02 E01–E07
(E07 temporary guard removed by populated indexing); T03/T04 chunking,
transport and incremental publication; T05/T06 rank/status/GC; T07 lock,
worktree and saved-key reuse; Linux subset of T08; local subset of T09.
T10 docs are in README.md, but full release acceptance remains unfinished.
No full-PRD completion is inferred. Every original coverage ID is retained;
amended size/security requirements point to the user decision.

Cleanup: fixtures use finally/afterEach/TemporaryDirectory; child processes
are awaited/killed, Docker uses --rm. No real keys, live API calls, release
publication or production writes. dist/ contains ignored local build artifacts.
Open: independent code reviews next; live-provider/relevance proof and release
matrix before full product readiness. No merge requested.
