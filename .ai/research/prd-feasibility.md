# PRD feasibility findings

Question: Can the PRD's OpenRouter/Bun design meet its standalone, snapshot-only search and worktree-isolation requirements, and what contracts must specification settle?

Cutoff: 2026-09-05. All external sources below accessed 2026-09-05; these are current documentation observations, not historical guarantees. Recheck model availability, API limits, and Bun/platform support when pinning dependencies and before release.

Artifact: `.ai/research/prd-feasibility.md`, under configured `paths.research` in `.ai/skills.json`. Step 1 adopted this path and recorded setup preflight READY in `.ai/work/iglo-mem/evidence/T00/setup.md`. Tool execution is pinned to `npx --yes bun@1.4.2`; bare Bun is absent. Preflight is not product verification.

Status: READY for shape/specify. Setup preflight is complete; dependent delivery tasks remain gated by D01–D05 and the contracts below. No implementation, build, paid API request, or external publication occurred.

## Local map (`how`)

Question: What existing code and data flows are affected?

Overview: There is no product implementation. `git ls-files` at `12f3514c91ae138f0c7c4729224c4279065b278f` contains the PRD, skill files and `skills-lock.json`; no CLI entry point, package manifest, tests or runtime symbols. The following is the required flow, not observed runtime behavior.

1. `init`: cwd → current worktree → preserve/create `.agent/memory.json` and directories → resolve environment/shared credentials → optional hidden prompt and atomic shared save → JSON. No API request. [PRD §§5,12](../../PRD.md#5-configuration)
2. `prepare`: worktree config + allowed Markdown → normalize/section/chunk → formatted input and profile hashes → reuse valid vectors or batch requests → validate/write vectors → publish complete `snapshot.json` while locked. [PRD §§6–9](../../PRD.md#6-embedding-profile)
3. `search`: config + locked snapshot/vector load → release lock once fully loaded → one query embedding → cosine and fixed lexical bonuses → file deduplication → up to eight snippets. No source access, freshness check or repair. [PRD §§10–11](../../PRD.md#10-search-algorithm)
4. `status`: prepared metadata/vector availability → JSON. `gc`: lock + valid snapshot references → remove only unreferenced vectors. [PRD §§12–13](../../PRD.md#12-cli-commands)

Data shape: repository config `{project, embedding.model}`; profile with model/endpoint/dimensions/versioned transformations; snapshot with timestamp, counts and active chunks containing stored text/locations/vector names; separate little-endian float32 files; user-level `{openrouter:{apiKey}}` credentials. Locations and snippets describe prepared content.

Where: `PRD.md` §§5–13. Gotchas: locking touches all index operations; credentials are shared across repositories while index state is worktree-local; dimensions participate in filenames but are discovered remotely. Unknowns: all implementation boundaries and executable behavior. Map status: COMPLETE for the available source.

## Intent (`why`)

Question: Why preserve explicit preparation and separate vector files?

Code: none. Direct evidence: `git log -- PRD.md` contains one introduction, `57105f9205d64762a6356f242832e4b232c9ca98` (`prd`); `git diff 57105f9 HEAD -- PRD.md` is empty. The [pinned PRD](https://github.com/iglo-tech/iglo.mem/blob/12f3514c91ae138f0c7c4729224c4279065b278f/PRD.md) explicitly assigns freshness to prepare (§§1–2), excludes unverified inbox observations (§4), and explains vector files as reusable, independently writable and committable artifacts (§8).

Inferences: explicit snapshots appear intended to make agent search predictable and independent of source availability. Unknowns: no earlier code, tests or linked design history establishes additional intent. Preserve: these explicit boundaries and the full PRD scope. Change: nothing in research. Avoid: automatic repair, shared cross-worktree indexes, or treating a first slice as the whole product. Risk: narrowing delivery without retaining later acceptance criteria. Intent status: COMPLETE within available evidence.

## External findings

### 1. Embedding transport is supported; universal model compatibility is unproven

**High confidence, documented:** OpenRouter accepts bearer-authenticated POST requests at `https://openrouter.ai/api/v1/embeddings`. Its reference exposes `model`, `input`, optional `dimensions`, `encoding_format` including `float`, and response entries with `index` and `embedding`. It also exposes optional `input_type`; support for this field does not establish that every model works equally well with the PRD's identical document/query request shape. [API reference](https://openrouter.ai/docs/api/api-reference/embeddings/submit-an-embedding-request)

**High confidence, documented:** arrays of strings support batching; model input limits can lead to truncation or rejection. The guide does not establish a universal 64-item, maximum-chunk-size guarantee. [Embeddings guide](https://openrouter.ai/docs/api_reference/embeddings)

The default ID is currently listed with an 8K context label. This is catalog evidence, not an authenticated availability test or precise batch-token contract. [Model page](https://openrouter.ai/openai/text-embedding-3-small)

**Implication/inference:** retain batches of up to 64, with a final partial batch; validate all response indices and dimensions as the PRD requires. Define character counting and whether the formatted prefix consumes the size budget. Do not claim a character limit proves compliance with token limits or silently truncate failed inputs. Invalid inputs/models must fail without publication. Alternate-model quality, exact aggregate request limits and routed-provider behavior remain validation gaps. Do not introduce model discovery or routing configuration merely to fill them.

### 2. Retry policy needs both a deadline and complete header parsing

**High confidence, documented:** the embeddings guide distinguishes invalid input, authentication, insufficient credit, unavailable model, rate limiting and provider overload. [Embeddings errors](https://openrouter.ai/docs/api_reference/embeddings#error-handling) OpenRouter documents honoring `Retry-After` with direct fetch. [Error guide](https://openrouter.ai/docs/api_reference/errors-and-debugging#retry-after-header)

`Retry-After` permits an HTTP date or nonnegative integer delay in seconds. [RFC 9110 §10.2.3](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3)

**Proposed contract:** retry 429, 5xx and temporary network failures within explicit attempt and elapsed-time budgets. If the required delay exceeds the remaining budget, fail instead of retrying early. Specify malformed/past header behavior, request/body timeouts and HTTP 408 handling. Keep permanent failures non-retriable. Return local redacted errors rather than passing through remote bodies. Numeric-only parsing from OpenRouter's example is narrower than the RFC; this is an example limitation, not a conflicting standard.

### 3. Standalone compilation is supported; target coverage still needs proof

**High confidence, documented:** Bun `--compile` bundles imported code/packages with its runtime; target flags select OS/architecture. The documentation includes Linux, macOS and Windows targets. [Bun executable documentation](https://bun.sh/docs/bundler/executables)

**Implication:** the proposed packaging is feasible without requiring users to install Bun or Node. It does not establish one universal binary, compatibility with every OS version, or successful packaging of future dependencies. Specify release targets and pin Bun. Run each promised artifact in a clean target environment without project dependencies or Git on PATH. Bare Bun is absent from PATH; intake recorded pinned execution through npm. No product compile/runtime claim was tested.

### 4. Credentials and terminal input constrain platform support

**High confidence, documented:** Node's `chmod` API does not distinguish owner/group/other on Windows; `O_NOFOLLOW` is absent from its listed Windows open flags. [Node filesystem documentation](https://nodejs.org/api/fs.html#fschmodpath-mode-callback)

Bun documents `node:tty` support. [Bun compatibility](https://bun.sh/docs/runtime/nodejs-compat#node-tty) Raw terminal mode disables echo and stops Ctrl-C from generating SIGINT automatically. [Node TTY contract](https://nodejs.org/api/tty.html#readstreamsetrawmodemode)

**Implication/inference:** POSIX modes alone cannot prove the Windows owner-only requirement. Recommend an explicitly scoped POSIX first release; retain Windows as conditional scope until an in-binary ACL and reparse-point design is proved, if Windows is promised. This is a recommendation for specification, not a scope decision. Test hidden entry, explicit Ctrl-C/EOF handling, and restoration after handled errors/signals in a PTY on the pinned Bun version. General Node documentation is not proof of identical Bun behavior. Define unavoidable abrupt-process termination limits rather than claiming cleanup code always runs.

Credential containment must include ancestor directories and resolution relative to the user's home, not merely the current repository. Proposed checks should reject symlinked storage paths and storage within any enclosing worktree. Concurrent resets across repositories require their own safe save semantics; a worktree index lock cannot serialize shared credentials.

### 5. Git metadata can be recognized without running Git

**High confidence, documented:** a working tree can have a `.git` directory or a text gitfile containing `gitdir: <path>`; gitfiles are used for linked worktrees and submodules. Git documents shared and per-worktree administrative storage separately. [Git repository layout](https://git-scm.com/docs/gitrepository-layout)

**Proposed contract:** resolve from cwd to the nearest valid worktree marker and keep `.agent` at that working-tree root, never under shared Git metadata. Specify malformed gitfiles, relative targets, nested repositories, symlinks, bare repositories, and treatment of `GIT_DIR`/`GIT_WORK_TREE`. This supports a filesystem resolver design, not a claim to reproduce every Git discovery mode. Test independent linked worktrees without the Git executable at runtime.

### 6. Atomic replacement and crash durability are different contracts

**High confidence, Linux-specific:** `rename` atomically replaces an existing destination; cross-mount renames fail with `EXDEV`. [Linux man-pages: rename](https://man7.org/linux/man-pages/man2/rename.2.html) File `fsync` does not necessarily persist the containing directory entry; directory synchronization is separately required. [Linux man-pages: fsync](https://man7.org/linux/man-pages/man2/fsync.2.html)

**Implication/inference:** use same-directory temporary files, finish and validate vectors before replacing the snapshot, and distinguish process interruption from power-loss durability. If durability is promised, specify synchronization ordering and failures after the publication commit point. These Linux references do not establish Windows/macOS or network-filesystem guarantees. Keep index locks through publication/loading/GC as required by the PRD. Define stale-lock recovery with ownership checks; age alone does not establish that a writer has stopped. Fault-injection and concurrent-process tests are still required.

### 7. Remote disclosure remains part of the product contract

OpenRouter's privacy documentation distinguishes its own retention controls from provider data handling; it does not establish a universal no-retention promise for every serving provider. [OpenRouter data collection](https://openrouter.ai/docs/guides/privacy/data-collection)

**Implication:** document that prepare transmits formatted document chunks and search transmits queries, as PRD §14 requires. Do not describe this as wholly local or promise provider-independent zero retention. No provider-routing feature is needed for the stated scope.

## Conflicts and remaining decisions

- **PRD §7 contradiction:** an indivisible code block or paragraph exceeding 5,000 characters cannot simultaneously remain intact, split only at paragraph boundaries, and satisfy the hard limit. Specification must explicitly resolve this. Rejecting such input before publication is one conservative proposal; silently splitting/truncating or allowing over-limit chunks changes a stated rule. Also settle exact overlap when it would cut a block, heading syntax, Unicode units and line ranges.
- **Profile bootstrap:** dimensions enter profile/vector identity but are initially unknown. Define how compatible cached metadata bootstraps reuse, including orphan-only caches and empty snapshots. Same dimension/model is not evidence of immutable remote model weights across time; the consulted sources do not provide a revision-pinning guarantee.
- **Validation integrity:** byte length and finite nonzero float values do not detect every same-sized vector corruption. The input-addressed filename does not checksum output bytes. Define the promised corruption detection and any snapshot digest metadata.
- **Search quality/performance:** no external source proves fixed ranking bonuses, a relevance threshold or the subsecond requirement for this CLI. At the PRD's example 1,536 dimensions, 10,000 float32 vectors occupy 61,440,000 bytes before text/metadata and require 15,360,000 component visits per full scan (arithmetic, not a benchmark). Define whether timing includes snapshot validation/vector loading, reference hardware and cold/warm conditions. Use fixtures/evaluation queries; retain the 0.80 semantic weight and eight-result cap.
- **JSON and locking:** settle status reporting versus fatal corruption, stable errors for invalid config/arguments/source failures, bounded wait/retry values, snapshot schemas, GC counts, and safe interruption/recovery. These are local contract decisions, not questions an external source can decide.

No material disagreement between consulted authorities was found beyond the narrower Retry-After example. Documentation support is not runtime verification.

## Open and handoff

Next owner: `specify`. Carry every intake contract gap and all PRD §§17–18 criteria into one or two initial vertical slices plus retained later scope. No user decision is needed to finish this research step.

Required before delivery: add product validation commands during T01, settle the chunking contradiction and release/platform contract, and prove the lock/security primitives. Setup preflight and path/toolchain configuration are recorded by intake; research did not edit them. Reconcile historical T00 pending notes in the next planning step.

Gaps: no authenticated embedding request, exact all-model batch/token limits, immutable routed-model identity, platform ACL implementation, clean-binary proof, benchmark, or fault-injection evidence. These are explicitly unverified, not successful checks. The Open Group rename pages were inaccessible through the browser (both Issue 8 and Issue 7 URLs); Linux man-pages provide narrower replacement evidence. An attempted OpenRouter errors URL failed; the current linked guide was accessible and cited above. Optional unavailable sources do not block specification.

Source integrity: all 663 PRD lines read; SHA-256 `08c10e1cc1381b05099b5e00d192c7c62f1ddae99d46b271982be01ca5942127` matches intake. Production code and PRD unchanged.


## Delivery refresh — step 2, accessed 2026-09-05

Question: Which external runtime facts constrain T01 credential safety, D03 bundled locking and D02 release feasibility?

Cutoff: 2026-09-05; every link in this refresh accessed on that date. Current vendor documentation is not a version-pinned runtime test. Prior same-day API findings above are reused, not independently re-fetched in this step. Recheck provider facts before T03/live validation and platform facts before release.

Local evidence (`how` / `why`): reread the PRD, intake, plan, briefs and T01/T02 spec. The source checksum remains `08c10e1cc1381b05099b5e00d192c7c62f1ddae99d46b271982be01ca5942127`; history still has only the PRD introduction `57105f9`, with no subsequent PRD diff. There is no product entry point, manifest, test suite or runtime symbol. The required flows and direct intent mapped above remain current. The proposed command/resolver/credential/preparation/transport/store/ranker boundaries in `.ai/briefs/iglo-mem-design.md` are design, not implemented behavior. No additional historical intent can be established. Preserve explicit freshness, independent worktrees and separate credential coordination. Map/intent status: COMPLETE for available evidence.

### R1. Bundled native access needs an explicit choice

**High confidence, documented:** Bun labels `bun:ffi` experimental with known bugs/limitations and advises against production reliance; it recommends Node-API for stable native integration. FFI can call C ABI libraries. [Bun FFI](https://bun.sh/docs/runtime/ffi)

Bun documents embedding directly required `.node` addons in compiled executables; dynamic package-loader indirection may prevent bundling. [Embedding N-API addons](https://bun.sh/docs/bundler/executables#embed-n-api-addons)

**Inference / next decision:** a narrow native addon is a candidate for OS locks and secure file operations. No package or primitive is selected here. FFI availability alone must not clear D03. Deep-design should compare an embedded addon against FFI's stated stability risk, then produce a compiled Linux multi-process experiment proving acquisition deadline, killed-holder release, stable identity, credential reset serialization and no dependency on an external executable. Include native library dependencies in clean-target proof. D03 remains open; it affects T01 saves as well as T02 index operations.

### R2. Process-lifetime locks exist, but identity and filesystem scope matter

**High confidence, Linux-specific:** `flock` offers exclusive/nonblocking acquisition. Locks attach to open file descriptions and release when all associated descriptors close. Local Linux locking does not require write access to the descriptor. NFS/SMB semantics differ. [Linux flock](https://man7.org/linux/man-pages/man2/flock.2.html)

**Inference:** a stable, existing lock object could avoid persistent search writes. Locking the replaceable snapshot or credential file is unsafe as a design: after replacement, new callers can open a different object. Select stable identity separately, including committed snapshots in fresh worktrees. Do not unlink/recreate a lock to recover from age or PID checks. The OS documentation does not prove a Bun binding, directory-lock portability, or the full five-second recovery contract.

**High confidence, Windows-specific:** `LockFileEx` provides file-range locking; the OS releases locks on close/process termination, but cleanup can be delayed by system resources. [Microsoft LockFileEx](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-lockfileex)

**Implication:** Windows has a candidate primitive, not demonstrated product support. Preserve bounded contention failure and test actual cleanup timing. Windows and macOS proof remain D02/D03 work.

### R3. Final-component no-follow is insufficient for credentials

**High confidence, Linux-specific:** `O_NOFOLLOW` rejects a symlink only at the final path component; earlier components still resolve through symlinks. Directory-relative `openat` operations address pathname race problems. [Linux open/openat](https://man7.org/linux/man-pages/man2/open.2.html)

**Inference:** T01 needs a handle-based traversal/publication design or demonstrated equivalent that protects ancestors as well as the destination. A chain of pathname prechecks plus final-component no-follow is not sufficient race evidence. Preserve the spec's owner/mode/link/containment validation and fail-closed behavior.

Windows security descriptors carry ownership and access-control information. [Microsoft security descriptors](https://learn.microsoft.com/en-us/windows/win32/secauthz/security-descriptors)

**Implication:** POSIX mode checks cannot substitute for an explicit Windows ACL/reparse-point implementation. That implementation remains unproved. The optional Microsoft “Creating a Security Descriptor for a New Object” page failed to load; the general descriptor reference was accessible, but does not establish an owner-only creation recipe.

### R4. Current target support is broader than a release promise

**High confidence, documented:** Bun lists Linux x64/arm64 with glibc or musl, macOS x64/arm64, and Windows x64/arm64 compile targets. [Bun compile targets](https://bun.sh/docs/bundler/executables#supported-targets)

Current installation documentation states macOS 13.0+, Windows 10 1809+, and x64 SSE4.2 requirements. Linux kernel 5.6+ is recommended; documented degradation reaches 3.10. [Bun installation](https://bun.sh/docs/installation)

**Implication:** retain the plan's five candidate targets. Windows arm64 is an additional documented capability, not newly authorized release scope. Minimum Bun requirements do not establish the CLI's security or addon minimums. D02 must name and test supported OS/architecture/libc combinations; a successful cross-compile is insufficient. No clean-target execution occurred here.

### R5. Startup loading can bypass the intended credential sources

**High confidence, documented:** standalone binaries enable `.env` and `bunfig.toml` loading by default. Bun supplies `--no-compile-autoload-dotenv` and `--no-compile-autoload-bunfig`, or corresponding compile options, to disable them. [Bun automatic config loading](https://bun.sh/docs/bundler/executables#automatic-config-loading)

**Inference / required specification follow-up:** default startup can import a repository-local key into the environment before the CLI resolver runs. This undermines the intended process-environment/shared-file credential boundary. Specify disabled automatic loading and prove it with dummy `.env`/`bunfig.toml` fixtures in both source and compiled runs. Reconcile the PRD's bare compile example with the required build settings; do not claim the bare command supplies those settings. This is a newly identified T01/T08 build-contract gap, not an implemented fix.

### Constraints and handoff

- D01 remains unresolved before T03: oversized blocks and exact overlap need an accepted-input decision. No outside source can choose the product policy.
- D02 remains unresolved before T08: native security, terminal, lock and clean-target proof; documented targets are not supported releases.
- D03 remains unresolved: choose and experimentally prove bundled locks before dependent verification, including shared credential saves in T01.
- D04 remains unresolved before T03: populated schema, dimension bootstrap and orphan cache integrity are local contracts, not externally settled facts.
- D05 remains unresolved before T05/T09: ranking, snippets and benchmark environment require fixtures and measurements, not documentation claims.
- Add R5's startup-loading contract to the next spec/build discussion. Reconcile T00's historical pending state with existing preflight evidence without marking product checks passed.

Conflicts: no new disagreement between authorities. Bun FFI's stability warning limits the feasibility claim; it does not contradict addon embedding support. The unchanged PRD chunking contradiction and bare-build/startup-loading gap remain explicit.

Open: no authenticated provider test; no selected native dependency, compiled lock experiment, PTY/security/ACL proof, exact CLI OS minimums, benchmark or remote model revision guarantee. Optional inaccessible Microsoft recipe is a stated gap. No user decision is required to hand this evidence to shape/specify.

Artifact: `.ai/research/prd-feasibility.md`. Only this findings artifact and the explicitly requested rolling handoff changed in step 2. No production code, source Markdown, dependency/config file, tracker, PR, API request or release changed. No runtime or product validation is claimed.

Status: READY for shape/specify; research step complete, product and required dependent gates unfinished.
