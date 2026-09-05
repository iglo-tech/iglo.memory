# iglo.mem design decisions

Current authority: [accepted user amendments](../specs/accepted-amendments.md). D01 and credential threat-model decision D03 are resolved. Earlier hard size/overlap and adversarial same-user credential requirements are superseded; prior evidence/status below is historical. Product implementation and index-lock proof resume; no coverage is inferred.

Status: READY_FOR_SPEC for responsibility boundaries; detailed contracts below remain open. This is the deep-design output for [the brief](iglo-mem.md). There are no existing production symbols or established ADR directory. These cross-cutting decisions are kept together here for specification and review; proposed function names are illustrative, not existing APIs.

## Current seam and chosen ownership

Evidence: [PRD §§5–13](../../PRD.md#5-configuration) defines commands and persistent formats; [research](../research/prd-feasibility.md) maps their required flows. No source implementation exists. The important vocabulary is **source document**, **formatted chunk input**, **embedding profile**, **vector artifact**, and **published snapshot**. A snapshot is prepared knowledge, not a live view of Markdown.

| Boundary | Owns | Must not own |
| --- | --- | --- |
| Command entry | Arguments, JSON/error mapping, composing operations; source/build startup policy | Chunking, credential storage details, implicit refresh |
| Worktree/config resolver | cwd discovery, validated local paths, project/model settings | Git subprocess requirement or shared worktree index |
| Credential handling | Resolve environment/saved key; init-only terminal/save/reset; containment and permission checks | Index profile identity, API authentication claims |
| Preparation | Source scan, normalization/chunking, deterministic input hashes, reuse plan, dimension establishment, complete candidate snapshot | Publishing an incomplete candidate |
| Embedding transport | Fixed endpoint, authentication, batching inputs, index mapping, vector validation, retry/deadline/redacted failure | Source reads, persistent writes or credential prompts |
| Snapshot store | Profile/vector integrity, complete reads, lock ownership, atomic publication and GC | Deciding source freshness or calling OpenRouter |
| Ranker | Loaded chunks/vectors plus validated query vector → deterministic file-deduplicated results | Filesystem/network access, repair or fallback |

Use plain functions and explicit data, not a provider framework or generic persistence layer. The small critical store operations are “load complete prepared data,” “publish validated candidate,” and “collect unreferenced vectors.” Holding a preparation lock surrounds scan through publication; read loading and GC use the same worktree coordination. Search releases after loading all required bytes, before its network request. Status uses a consistent locked view too. Credentials need separate user-level save coordination because worktree locks cannot protect cross-repository resets.

## Alternatives

The simpler option is one command module doing all filesystem and network work. Reject it as the lasting boundary: it makes search's zero-source-read/zero-write contract hard to enforce and duplicates validation. Sharing a few narrow functions is sufficient; do not build a class hierarchy.

One mutable vector file simplifies opening files but contradicts the required independent content-addressed artifacts and broadens failed-write damage. A database or background service violates runtime constraints. Reader/writer lock machinery may improve concurrency but is unnecessary until measurements justify it; one bounded exclusive worktree lock is the proposed baseline allowed by the PRD.

## Data and runtime decisions for specification

1. **Identity and integrity:** version canonical profile and input serialization. Hash all PRD profile fields, including formatting/normalization/chunker versions; key changes never affect identity. Keep vector filenames input-addressed as required. Proposed addition: snapshot records a digest of each vector's bytes, since size/nonzero checks cannot detect valid-looking bit corruption. This detects accidental mismatch, not malicious coordinated snapshot replacement. Store validates containment and exact binary shape before loading or publication.
2. **Dimensions and cache:** preparation owns dimension establishment, transport validates responses, store never infers compatibility from file size alone. Reuse dimensions only from validated compatible metadata; incompatible profiles cannot bootstrap each other. Specification must define orphan-only reuse evidence and empty-to-nonempty transitions without a remote discovery feature. A first batch may establish dimensions when no trustworthy profile exists. Do not promise zero calls for caches whose integrity/profile cannot be established.
3. **Atomicity:** store writes validated same-directory temporary files before final replacement; snapshot replacement is the publication commit point. Do all fallible required preparation work before that point. Specify errors and reporting after commit separately so an already published snapshot is not described as an untouched prior snapshot. Process interruption safety is required; power-loss/network-filesystem durability is not established by research and must not be claimed implicitly.
4. **Locking:** store owns bounded acquisition and release; proposal is one exclusive lock per worktree for prepare/load/status/GC. Specify ownership, race-free release, interrupted-holder recovery and wait budgets. Age alone must never authorize deleting a live process's lock. No extra CLI command is implied. Shared credential replacement needs secure temporary files and a defined concurrent-reset winner or bounded independent lock.
5. **Chunking:** preparation owns a pure deterministic parser/chunker. Proposed conservative failure for impossible size/block/overlap combinations is described in the brief. Specification must cover giant paragraphs/fences, nested headings, headingless text, Unicode, LF/source lines and whether exact overlap can coexist with paragraph boundaries. The full chunking conflict remains required until the specification states a coherent accepted-input contract.
6. **Results and diagnostics:** ranker owns fixed constants, tokenization preserving technical identifiers, tie-breaking, file winner, relevance cutoff and bounded snippet selection. Command layer owns exact JSON schemas. Preserve the PRD's status example reporting missing vector counts; distinguish inspectable incomplete data from structurally invalid metadata, and specify behavior for corrupt present vectors. Search always fails for any unusable active vector. GC validates its reference authority before deleting anything; source changes never authorize deletion.
7. **Security and discovery:** resolver walks to the nearest valid `.git` directory/gitfile without invoking Git and stores data at that worktree root. Specify malformed markers, nesting, symlink paths, bare repositories and Git environment overrides. Credentials reject unsafe paths and verify owner-only storage on every promised OS, including ancestor containment; source scanning rejects symlink escapes. Never return raw API error bodies or log full document input.

## Delivery design refresh — step 3

Research evidence: [step 2 R1–R5](../research/prd-feasibility.md#delivery-refresh--step-2-accessed-2026-09-05). These are documentary constraints, not newly tested runtime facts.

- **Native boundary:** prefer investigating a directly embedded Node-API addon exposing only required lock and secure-file operations. Simpler portable filesystem calls are acceptable only where they prove the same contract; pathname prechecks plus ordinary writes do not resolve ancestor replacement races. FFI is a fallback candidate with the research's documented stability risk, not the default production choice. Reject external lock executables and PID/age lock theft. No addon or binary dependency is selected by this decision. D03 owns the disposable compiled multi-process experiment once the binding and identity are specified; D02 repeats proof per release target.
- **Stable identity:** do not lock `snapshot.json` or `credentials.json`, because publication replaces them. Store owns a stable worktree coordination object; credential handling owns a separate stable user-level object. Its exact representation remains D03, including a committed snapshot in a new worktree with no persistent search writes. Failure to prove that combination blocks the store design.
- **Secure paths:** credential handling must use race-safe ancestor traversal and validate the opened objects, with no-follow handling at each relevant component. Final-basename checks alone are insufficient. Keep owner/permission/containment checks within the protected save transaction; an environment override skips saved-storage access. Platform ACL/reparse-point implementation remains D02. No promise of protection follows merely from TypeScript prechecks.
- **Startup:** command entry and build configuration own disabling automatic repository dotenv/bunfig loading before credential resolution; credential code cannot reliably undo startup changes. Specify source-run controls and compiled build settings, including the researched `--no-compile-autoload-dotenv` and `--no-compile-autoload-bunfig` options, against pinned Bun. Reject the simpler bare compile example as sufficient proof of this boundary. Acceptance uses dummy repo-local keys/config and an isolated home to prove only the inherited process key or safe saved key is consumed. Environment overrides remain supported and never auto-saved. T01 and T08 own the checks.

No prototype is run in this step: no binding is selected and no concrete experiment can yet settle the joint identity/packaging contract. D03 retains that required experiment with explicit pass conditions above; this is not prototype or production evidence. There is no running product flow for ux-proof. Terminal states and accessibility intent are in the brief; PTY and manual terminal evidence remain required.

## Open decisions and evidence owners

| Required before build | Owner / evidence to produce |
| --- | --- |
| All exact JSON schemas, retry/timeout budgets and source/config errors | Specify; command/API fixture matrix, both Retry-After forms, permanent versus transient failures |
| Coherent chunking and cache/profile contracts | Specify; deterministic examples and expected rejection cases; no hidden relaxation of PRD |
| Release targets, terminal/security semantics and lock recovery | Specify; platform matrix and executable/PTY/filesystem fault-test plan; preserve unresolved ACL blocker if unsupported |
| Ranking relevance and performance acceptance | Specify; fixed constants and representative expected semantic/exact/no-match queries; named hardware, dimensions, OS, cold/warm conditions, timer boundary |
| Delivery prerequisites | T00 preflight READY per evidence/T00/setup.md; T01 adds actual product validation commands. Bootstrap readiness does not verify product behavior |

Benchmark proposal: measure local snapshot validation/loading and ranking separately and together at 10,000 active chunks; exclude query network latency and separately report lock waiting. The PRD expressly requires vector search under one second; specification must state which local total is gated so an isolated inner-loop result cannot masquerade as end-to-end speed.

Evidence reviewed is documentary only. Prior research supplies external citations; this step adds no vendor claims or API calls. No existing running flow or open visual-design question justifies prototype/ux-proof. Future terminal experiments would be disposable evidence, not production acceptance.

Decision: command orchestration with narrow credential, preparation, transport, store and ranker ownership
Current seam: PRD command/data contracts; no production implementation
Alternatives: single module; mutable vector file; database/service; reader/writer locking
Contracts: command JSON, profile/snapshot/vector formats, locks, credentials, terminal and filesystem boundaries
Artifact: .ai/briefs/iglo-mem-design.md
Open: D01–D05 detailed contracts and platform proofs; T01/T08 startup-loading specification and evidence
Status: READY_FOR_SPEC

## D03 experiment selection — step 5

Disposable Linux binding: a project-owned C Node-API addon, ABI version 8,
compiled with system cc and Node headers, embedded by Bun 1.4.2. No npm runtime
package is selected. Expose directory open, nonblocking flock, close, and an
openat/renameat dummy save only to the experiment. The index lock identity is
the existing worktree root directory inode (never the replaced snapshot or a
generated lock file). Credentials use the opened OS-home directory inode so
replacement of the application directory cannot create a second save lock.
Each process owns its descriptors until close/exit. Never unlink lock objects.

The simpler Node filesystem API cannot expose flock/openat. A lockfile with
stale-PID removal fails ownership recovery. Directory descriptors avoid
persistent reader writes and keep directory-relative operations attached to
the opened object. Test whether that attachment also satisfies G05 containment
when the same OS user relocates an opened credential ancestor into a worktree.
No production storage is authorized by a partial passing experiment.
