# Accepted contract amendments — 2026-09-05

Authority: user reply after step 8: easy shared credentials outside repositories,
no elaborate security; no hard input-length limits or separate size classes.
These amendments supersede conflicting older PRD/spec/plan prose. Historical
verification remains historical; no coverage row is completed by this decision.

D03 security decision RESOLVED: use ~/.config/iglo.mem/credentials.json shared
across repositories, environment override, hidden init/reset entry, 0700/0600
permissions on POSIX, static path/symlink and outside-repository checks, unique
restricted temporary file plus atomic replacement. Trust other processes running
as the same OS user; no adversarial ancestor-relocation guarantee, privileged
helper, descriptor-relative credential framework or mandatory credential lock.
Concurrent successful atomic saves have last-commit-wins semantics. Keep
redaction and preserve old bytes on failed saves. G05/I13 adversarial credential
race tests are superseded by ordinary path/permission/save-failure tests.
Index process locking remains required for data consistency, independently of
credential security. Use a small embedded POSIX flock binding on the worktree
directory: no lockfiles, stale-PID recovery, persistent search writes or daemon.
The native module owns only lock acquisition/release, never credentials.

D01 RESOLVED: all Markdown uses one heading/paragraph/block pipeline with no
local input-length rejection. Group complete paragraphs/code blocks toward a
soft 5,000-code-point target; an indivisible long block remains intact. Begin a
new group at a paragraph/block boundary when the next block exceeds the target.
No fixed overlap, truncation, hard block/chunk cap or size-category branch.
Headings accompany every embedding input and result. Longer documents naturally
produce more chunks. Provider input limits may still produce a redacted API
error and leave the previous snapshot intact; no promise of infinite provider
capacity. Chunker version markdown-blocks-v1 supersedes markdown-sections-v1.

D04 contract: schema version 1, canonical profile hash includes endpoint/model/
dimensions/chunker/format/normalization; per-vector byte digests in snapshot.
Atomic JSON receipts beside vectors store profile and input/byte hashes for
valid orphan reuse. Unknown/incompatible/corrupt artifacts are never reused.
Empty snapshots may retain known compatible dimensions. Status counts missing
unique vectors; search/GC require all referenced vectors valid. Source paths
are relative to the fixed canonical roots and never traversed by readers.

D05 algorithm contract: cosine*0.80 plus exact phrase .10, text-token .06,
heading-token .03 and filename-token .01. Minimum score .25, stable source/line/
hash tie break; deduplicate files before top eight. Snippets cap at 400 code
points (output excerpt only, not input acceptance); no whole-document endpoint.
Use controlled query vectors for algorithm proof and keep real-provider quality
and 10,000-chunk end-to-end performance proof separate. Benchmark this runner;
record actual hardware and results, never infer quality from mocks.

D02: Linux x86_64 is the available implementation/verification environment.
Other candidate OS/architectures remain unverified, not silently promised or
removed from the plan. Publish no release during this task.

Next: build T01 shared setup and process-safe index foundation, then T02–T10.

## Final implementation/verification scope

D02 release-build decision: Linux x86_64 is the supported target for this PR,
proved on the local runner and clean Debian container. The PRD does not name an
OS/architecture matrix; the older multi-OS list was explicitly a candidate
investigation, not a support promise. Those candidates remain unverified future
ports and are not silently advertised as supported. They are not a new gate
on the tested Linux executable. GitHub Actions provides the downloadable
single-executable artifact for installation acceptance; no tagged release or
merge is authorized by this finish task.

D05 live proof: the owner configured a saved key and authorized one small live
fixture batch plus two queries. Both semantic paraphrase and exact-term queries
rank the intended document first. The source-unreadable search and saved-key
cron-style execution pass; see live-openrouter.json. Bounded snippets remain
the default response, without a full-document retrieval mode. A short prepared
passage can fit entirely within the excerpt; no input-size rejection is added.
