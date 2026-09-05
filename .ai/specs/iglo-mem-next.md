# iglo.mem: first two implementation slices

Current authority: [accepted user amendments](accepted-amendments.md). D01 and credential threat-model decision D03 are resolved. Earlier hard size/overlap and adversarial same-user credential requirements are superseded; prior evidence/status below is historical. Product implementation and index-lock proof resume; no coverage is inferred.

Status: step 4 specification complete for the next frontier. T01/T02 observable contracts are specified; D03 implementation feasibility remains required before dependent secure storage work. T00 preflight is READY. Full-product contract is NOT complete. Independent T01 modules now exist; partial verification and a failed D03 probe are recorded in the plan. Full T01/T02 product verification remains blocked.

Authority: [PRD](../../PRD.md), [brief](../briefs/iglo-mem.md), [design](../briefs/iglo-mem-design.md), [research](../research/prd-feasibility.md). Full scope, decision gates and requirement coverage live in [plan](../work/iglo-mem/plan.md). PRD SHA-256: `08c10e1cc1381b05099b5e00d192c7c62f1ddae99d46b271982be01ca5942127`.

Paths: adopted in `.ai/skills.json`; [T00 evidence](../work/iglo-mem/evidence/T00/setup.md) records preflight READY with pinned Bun. T01 must add product commands. Step 4 refreshed startup loading, race-safe credential access, decision proof checks and requirement links. Build starts with the D03 experiment and independent T01 tooling; it must not treat the experiment as product verification.

## goal

T01: A maintainer can initialize a worktree, securely supply or reuse a shared credential, and receive machine-readable output without contacting OpenRouter.

T02: A maintainer can explicitly prepare an empty canonical source set and inspect/search that valid empty snapshot without credentials, remote calls, source reads during search, or automatic repair.

These are vertical terminal-to-filesystem flows. They do not substitute for the full product. First implementation and measurement target is Linux x86_64; release coverage remains gated by D02 in the plan.

## non_goals

No document embedding, populated-snapshot ranking, source chunking, GC, release publication, alternative commands, GUI, source editing, scheduler installation, or real credential/API use in these slices. Unsupported later flows must return a JSON `FEATURE_NOT_READY` during development; that temporary code must disappear before release. No successful empty response may disguise nonempty sources or an unsupported populated snapshot.

## decisions

- Retain the design's narrow command, resolver, credential and snapshot-store boundaries. Use ordinary functions; no provider abstraction or generic database layer.
- Treat config as user-owned bytes. Init creates it exclusively if absent, otherwise validates it without rewriting. `project` defaults to the worktree directory basename. Project and model must be nonempty strings after trimming; reject CR/LF/NUL so future formatted inputs stay unambiguous. Preserve unknown existing fields but give them no runtime semantics. Source roots are fixed to the two PRD directories; no source-root option exists.
- Resolve cwd physically and walk ancestors to the nearest `.git` directory or gitfile. A directory must contain valid HEAD and repository administrative structure; a gitfile must contain one `gitdir:` path resolving to accessible administrative metadata (including linked-worktree `commondir`). Stop with `REPOSITORY_INVALID` on the nearest malformed marker; never fall through to a parent repository. Bare repositories and paths with no marker fail. Ignore `GIT_DIR`/`GIT_WORK_TREE`: cwd defines the worktree. Support relative gitfile paths and nested repositories; do not spawn Git. `.agent` remains at the discovered worktree, never the common gitdir.
- Reject symlinked `.agent`, managed config/index paths and credential storage components. Source scanning must never traverse source symlinks. Do not reject a normal physical cwd merely because the user's shell reached it through a symlink.
- Environment key: trim surrounding whitespace; nonempty value wins and skips saved-file access entirely. Never persist it. Use the OS user's home for the fixed shared path, independent of cwd and Git configuration. No XDG/custom path setting is introduced.
- Credential directory and file must be owned by the current user with modes 0700 and 0600 on the initial POSIX target. Reject broader permissions, nonregular file, multiple hard links, symlink components, inaccessible paths, malformed JSON, or empty/wrong-type `openrouter.apiKey`. Existing ancestors must not permit untrusted replacement of storage. Check that the physical destination is outside every enclosing Git worktree, including a home-directory repository. Do not chmod an unsafe existing file and pretend it was valid.
- Ordinary init never overwrites malformed saved credentials. Explicit reset may replace malformed *contents* at an otherwise safe destination; it must reject unsafe ownership/path/permissions. It preserves the old bytes until atomic replacement succeeds.
- Coordinate saves across repositories independently of index locking. Serialize only the final validation/save transaction, after prompting. Two successful resets have last-committed-save wins semantics; acquire within 5 seconds or return `CREDENTIALS_SAVE_FAILED`. Use an OS-released exclusive lock or another demonstrated race-safe primitive, never age-based lock theft. Validate destination under the lock, write a unique same-directory restricted temporary file, finish and validate it, then atomically replace. Remove only the caller's own temporary files. Never replace a prior key before the commit point.
- Terminal setup requires both stdin and stderr to be TTYs. Print the key creation URL, resolved save location, plaintext/shared-storage explanation, and hidden-entry instruction to stderr before `OpenRouter API key:`. Accept Unicode input, trim it, reject empty submission with a stderr message and reprompt. Ctrl-C, Ctrl-D/EOF and handled termination cancel. Restore the prior terminal mode in every handled success/failure/cancel path. Use no external terminal executable. Abrupt uncatchable process termination cannot promise application cleanup; PTY/OS behavior must be measured, not called verified.
- Init creates missing PRD directories before credential resolution; credential failure may leave safe partial repo setup. Init never creates snapshot.json or scans Markdown. An existing malformed config fails explicitly and is not replaced.
- Snapshot operations share one worktree-local exclusive OS-released lock, bounded to 5 seconds including waits; failure is `INDEX_BUSY`. Lock identity is stable and must not be unlinked/replaced while holders/waiters exist. Process exit must release ownership without deleting another owner's lock. D03 requires multi-process proof before T02 can be verified. Search/status release after loading a consistent in-memory view; prepare holds from scan through atomic snapshot replacement. No network call belongs inside read loading.
- PRD's ban on index mutation during search means prepared snapshot/vector bytes and metadata remain unchanged. Acquiring synchronization is allowed by §13. Create lock infrastructure during init/prepare, not during search; validate missing snapshot before trying to acquire a nonexistent lock. A committed snapshot must remain loadable after worktree creation, so the final lock primitive must support preexisting snapshots without needing persistent index writes by search (D03).

### Startup and secure storage contract

The launch boundary must preserve the inherited process environment without importing repository dotenv files or executing repository bunfig preloads. Apply controls before CLI code runs. Do not delete or reinterpret an already inherited environment key based on a guess about its origin.

For supported source execution, invoke pinned Bun with `--no-env-file`, `--no-install` and `--config=<absolute path>` pointing to an absolute, trusted empty Bun configuration outside the target repository. Use an absolute CLI entry point while preserving the target worktree cwd. The build owner must prove that explicit configuration also excludes global/ancestor preload merging; if it does not, isolate the source launcher further before accepting I12. A bare `bun src/cli.ts` is not the supported source launch contract. No wrapper may change the OS home used for product credential lookup.

The supported build retains PRD §15's entry point, compile mode and output, adding `--no-compile-autoload-dotenv` and `--no-compile-autoload-bunfig`. Invoke the build itself under the trusted source-startup controls. Never inline a credential with build definitions or environment substitution. Treat the bare PRD command as an illustrative build shape; the two added options enforce §14, without changing command behavior or required runtime installation. Verify the actual options on pinned Bun during build; research support and local help inspection are not compiled proof.

Credential reads and saves traverse from a trusted OS-home anchor through opened directory handles, checking each relevant object without following symlinks. Use directory-relative opens and publication, or an experimentally proved equivalent. Revalidate identity, ownership, permissions, link count and outside-worktree containment within the protected transaction. A substituted ancestor must not redirect a read, temporary write, rename or cleanup. Do not release handles and reopen by an unchecked absolute pathname. Existing root-owned ancestors are acceptable only if they prevent untrusted replacement; the application directory/file must be current-user owned and owner-only. New directories must be created and validated relative to protected parents. Final-component `O_NOFOLLOW` plus earlier pathname checks is insufficient.

Storage validation errors remain CREDENTIALS_INVALID; failure of an otherwise valid save transaction, lock deadline or publication is CREDENTIALS_SAVE_FAILED. No partial key may escape the protected destination, including during cancellation or contention. Environment precedence bypasses this entire saved-storage path except explicit reset.

### D03 proof gate (next build action)

Keep this experiment disposable and separate from T01/T02 production tests. First record the selected native binding, stable lock identities, handle ownership and cleanup rules in the design note. Prefer the existing embedded Node-API direction; justify any alternative against the same contract. No binding is selected by this spec.

| Check | Given / When / Then |
| --- | --- |
| G01 | Given a compiled development-target experiment with no Bun/Node/Git or lock executable on PATH, when independent processes acquire the same stable object, then at most one enters its protected region; a waiter acquires within the five-second budget or returns the bounded failure. Record native library dependencies. |
| G02 | Given holder A and waiter B, when A atomically replaces credential/snapshot data and process C starts, then B and C still contend on the same identity. Repeat after killing A and during waiter cancellation; no PID/age-based theft or unlink/recreate recovery is allowed. |
| G03 | Given a committed snapshot copied into a fresh linked worktree without generated lock files, when a reader loads it, then coordination works without persistent index writes; another worktree proceeds independently. If the identity cannot support this, return to deep-design before T02 implementation. |
| G04 | Given simultaneous dummy credential saves in two repositories, when a holder dies before/after the commit point, then saved bytes are one complete committed value, the last successful commit wins, and later saves recover under the bounded wait. Old bytes survive every precommit failure. |
| G05 | Given adversarial swaps of credential ancestors/final paths during read, temporary creation and rename, when the experiment runs, then no key is read from or written to an unsafe target, errors are redacted, and only owned temporary artifacts are cleaned up. Include a home inside a worktree and replaced administrative markers in containment checks. |

Record exact build/run commands, OS/architecture/filesystem, binding version, timing, sanitized interprocess event trace, hashes and exit status under `.ai/work/iglo-mem/evidence/D03/`. Remove disposable binaries/fixtures afterwards. Close Linux D03 only when G01–G05 pass; D02 still requires target-specific proof. If they fail, keep D03 blocked and use deep-design/research for the failed seam. Do not implement dependent storage on a guessed primitive. Independent argument/config/tooling work remains available.

## interfaces

All commands emit exactly one JSON object plus newline to stdout and exit 0 on success or 1 on application failure. Prompts/diagnostics go only to stderr. Errors use exactly `{error:{code,message}}`; messages are local templates with no secret, arbitrary argument echo, raw provider body, or source text. Unknown commands/options, missing/extra search arguments, and blank queries return `ARGUMENT_INVALID`. No `--api-key` option exists. `init --reset-credentials` is the only setup flag. Other commands never prompt.

| Operation | Success fields / meaning |
| --- | --- |
| init | `project` string; `credentialSource` = `environment`, `saved`, or `entered`; `credentialsSaved` boolean true only for this invocation's committed hidden entry |
| prepare | PRD fields `project`, `preparedAt`, `documents`, `chunks`, `reusedVectors`, `embeddedVectors`; all counts zero for T02 |
| search | PRD fields `query` (original argument), `preparedAt`, `results`; T02 results is `[]` |
| status | PRD fields `project`, `preparedAt`, `documents`, `chunks`, `vectors`, `missingVectors`, `profile`; T02 counts are zero |

Init does not report index readiness. Recovery instruction “Run iglo.mem prepare before first search” belongs on stderr.

Error precedence: arguments → worktree → config → command-specific paths/lock → snapshot metadata/version/project/profile → active vector integrity → credentials only if needed → API. Init performs safe repo setup then credential handling. No index existence check during init. Before prepare, absent config is `CONFIG_INVALID` with init instructions. Invalid repo/path is `REPOSITORY_INVALID`; invalid config is `CONFIG_INVALID`; scan/I/O failure is `SOURCE_INVALID`/`INDEX_WRITE_FAILED` as applicable. Missing snapshot is `INDEX_NOT_READY`; invalid/truncated schema is `INDEX_INVALID`; recognized but unsupported schema/profile version or project/model mismatch is `INDEX_INCOMPATIBLE`. All three index errors instruct prepare. Preserve PRD credential, embedding and busy error codes. Non-TTY reset returns `SETUP_REQUIRES_TTY` without waiting; missing ordinary-init key is `API_KEY_MISSING`. Cancellation is `SETUP_CANCELLED`.

Empty snapshot schema version 1 contains `schemaVersion`, `preparedAt` (UTC ISO 8601), `project`, `profile` object, `documents:0`, `chunks:[]`. Profile contains PRD fields `profile`, `baseUrl`, `model`, `dimensions:null`, `encodingFormat:"float"`, `chunker:"markdown-sections-v1"` plus explicit `inputFormatting:"project-file-section-v1"` and `normalization:"lf-v1"`. Its hash is SHA-256 of UTF-8 compact JSON serialization of the ordered array `[baseUrl,model,dimensions,encodingFormat,inputFormatting,chunker,normalization]`, excluding the hash itself. Profile ID is lowercase `sha256:<64 hex>`. Known versions are checked without scanning sources. Null dimensions is valid only with zero chunks. Populated chunk schema is reserved to T03 specification; T02 must reject unsupported populated data, not return success.

For T02, prepare scans only the two fixed source roots and ignores all PRD excluded paths. Missing roots are treated as empty; unreadable existing roots fail `SOURCE_INVALID`. Only regular `.md` files count as documents. If any such file exists (including an empty file), this development slice returns `FEATURE_NOT_READY` before publication. Source symlinks cause `SOURCE_INVALID`; excluded trees are never traversed. T03 replaces this temporary guard with full chunking. A fully empty scan publishes the zero-document snapshot via validated same-directory temporary file and atomic replacement. All required fallible preparation work precedes publication. Failure before replacement preserves prior bytes; success is established at replacement. A broken stdout pipe after commit must never be described as rollback. Search/status load from the snapshot only, even if allowed source directories later become unreadable or contain new files.

## acceptance_criteria

Each ID below is an eventual executable scenario; no scenario has run yet.

| ID | Given / When / Then |
| --- | --- |
| I01 | Given a repository with no config and environment key, when init runs from a nested cwd, then it creates exactly the PRD setup files/directories, default model and basename project; returns environment/false; makes zero API calls and never writes the key. |
| I02 | Given existing valid config with custom model and source sentinel files, when init reruns, then their bytes remain identical and missing setup directories are created; credential setup still runs. |
| I03 | Given no key and a PTY, when a dummy key is entered, then prompts appear only on stderr, no entered characters echo, credentials commit with 0700/0600, result is entered/true, and terminal mode is restored. |
| I04 | Given saved credentials, when init runs in a second repo/linked worktree with no env key, then result is saved/false, no prompt occurs, and no worktree contains the key. |
| I05 | Given malformed/insecure saved storage and a valid env override, when init runs, then saved storage is neither read nor altered; without override it returns CREDENTIALS_INVALID. |
| I06 | Given no credentials and non-TTY input, when init runs, then it promptly returns API_KEY_MISSING without consuming stdin; non-TTY reset returns SETUP_REQUIRES_TTY even with an env key. |
| I07 | Given a previous saved key, when reset is canceled, reaches EOF, or suffers injected write/rename failure, then old bytes remain and terminal state is restored; successful reset replaces only credentials despite an env override. |
| I08 | Given symlink/hardlink/unsafe-owner/permission/worktree-contained credential paths, when init/reset attempts storage access, then it rejects them without reading an unsafe target or modifying it. |
| I09 | Given two repos resetting concurrently, when saves overlap, then each successful file is complete and owner-only, last commit wins, bounded lock failure is redacted, and process death cannot permit two simultaneous writers. |
| I10 | Given normal, linked and nested worktrees without Git on PATH, when init resolves cwd, then it chooses only the nearest worktree; malformed gitfile, bare repo and no marker fail explicitly. |
| I11 | Given unknown commands/options or keys embedded in invalid arguments, when parsing fails, then stdout is one JSON error, exit is nonzero, and diagnostics do not echo the argument or key. |
| I12 | Given repository/ancestor dotenv variants with a dummy key and bunfig preload sentinels, when the supported source launcher and compiled CLI run with no inherited or saved key, then non-TTY init returns API_KEY_MISSING, no preload sentinel executes, and no repository key is consumed. Repeat with a safe saved key and with an inherited override: saved/false and environment/false respectively, with saved bytes unchanged. Include trusted-global-config isolation in the source case. |
| I13 | Given concurrent ancestor/final-component substitution during credential read/save, when init/reset runs, then no unsafe destination is read or written, a stable redacted error is returned, and previous safe credentials survive every precommit failure. Prove through access traces and sentinel targets, not just successful static symlink rejection. |
| E01 | Given config, empty roots and no credentials, when prepare runs, then it publishes a validated null-dimension snapshot with zero counts and no credential read or API call. Repetition succeeds with zero requests. |
| E02 | Given that snapshot, when search runs after sources are added/deleted/made unreadable, then it returns query/preparedAt/results:[] without source access, credential read, network or index-content changes. |
| E03 | Given that snapshot, when status runs, then its counts are zero and profile/timestamp match; no source read, credential read, network or mutation occurs. |
| E04 | Given missing, truncated, malformed, unsupported or project/model-mismatched snapshot, when search/status runs, then it returns the specified missing/invalid/incompatible error before credentials or API access, with prepare instructions and no repair. |
| E05 | Given an old valid snapshot, when prepare fails before atomic replacement, then its bytes remain identical and searchable; when prepare commits, then readers see exactly the complete old or new snapshot. |
| E06 | Given another process holding the worktree lock, when prepare/search/status contends, then it either acquires safely within 5 seconds or returns INDEX_BUSY; a separate worktree proceeds independently. Terminated holders release ownership safely. |
| E07 | Given a nonempty regular Markdown source or unsafe source link, when T02 prepare runs, then it returns FEATURE_NOT_READY or SOURCE_INVALID respectively without replacing the snapshot. No development guard survives T03/release. |

## qa_procedure

Use disposable ordinary and linked worktrees, an isolated OS test user/home and dummy sentinel keys. Never alter the operator's saved key. Capture stdout and stderr separately and parse every stdout result as one JSON object. Deny network for T01/T02; trace filesystem access to prove negative requirements rather than infer them from output. Hash config/source/index files before and after each relevant flow.

For T01 run initial setup, saved reuse in a second repo, env precedence, reset/cancel/EOF, permission/symlink faults and concurrent resets. Use a PTY harness to inspect echo and restored terminal attributes and manually exercise keyboard-only prompts. Search captured output, logs and disposable repository files for sentinel secrets; expected secret storage is only the isolated home file. Verify permissions/ownership directly.

For I12 run both supported source and compiled commands from nested fixture cwd, with repository/ancestor dotenv and bunfig preloads and a separate global configuration sentinel. Capture process/file effects as well as JSON. For I13 race ancestor substitutions under the isolated OS test user; retain evidence of touched paths and precommit preservation. Do not use the operator's home or credentials. G01–G05 are feasibility evidence and must be followed by the production I/E scenarios.

For T02 prepare empty roots, search/status, then add/delete/deny sources and repeat search/status. Inject write/rename failures and terminate holders at each lock/publication boundary. Run separate processes in both worktrees and trace bounded contention. Store command, exit, sanitized output, file hashes, access trace and commit in `.ai/work/iglo-mem/evidence/T01/` or `T02/` when actually run. No evidence files are fabricated now.

## compatibility_constraints

Preserve PRD command names, field names, fixed endpoint/model defaults, existing config/source bytes, shared credential path, current-worktree scope and source-independent reads. Profile formatting/chunking versions are reserved now; before T03 writes any nonempty snapshot, freeze their exact semantics or bump the version. No claim of Windows ACL or standalone release support follows from a Linux test. No hidden remote model revision can be detected by this profile scheme.

## risks

Secure filesystem operations and lock lifetime need actual pinned-Bun/OS proof. A pathname precheck alone is insufficient against replacement races: use safe handles/identity verification or fail closed. If required primitives cannot be bundled, stop the affected task and return to deep-design; do not use external executables or unsafe timestamp-based locks. Atomic visibility is required for process interruption; power-loss/network-filesystem durability is not established. Config edits concurrent with an operation take effect on the next invocation; the operation uses one validated config read.

## next_slice

Build begins with D03 G01–G05 and independent T01 launch/tooling/config work, then T01 secure initialization with production save proof. T02 empty-snapshot preparation follows T01 and D03 lock-design proof. T03 nonempty indexing remains blocked by D01 chunking and D04 populated-format contracts.

## tasks

- T01 implements and verifies I01–I13 as one maintainer flow.
- T02 implements and verifies E01–E07 as one empty-index flow.
- Full task IDs, dependencies, states and all later requirements are retained in the plan; no later task is implicitly complete.

## dependencies

T00 preflight has reported READY; T01 adds actual product commands. D03 must demonstrate safe lock lifetime and stable identity on the development target for T01 credential-save verification and before T02. Full release additionally depends on D02 platform proof. Relevant PRD requirement links are in coverage.md; I/E checks complement rather than replace them.

## open_questions

No user answer is needed for the D03 feasibility experiment or independent T01 tooling work. Source config isolation and bundled secure operations need executable evidence; the stated outcome is fixed, but the primitive remains unselected. D01's size/overlap contradiction is unresolved and blocks T03, not these empty/init slices. D02 release targets/security and D03 bundled lock feasibility remain evidence gates. D04 must freeze populated snapshot/vector/cache rules before T03; D05 must calibrate relevance and name benchmark hardware before T05/T09. None is cleared by this spec.

## requirement_links

Stable IDs refer to [coverage](../work/iglo-mem/coverage.md); that table retains all 294 source units. These links identify the next slice's focused checks, not evidence of completion or reassignment of later obligations.

| Checks | Requirement IDs / PRD contract |
| --- | --- |
| I01–I02, I10 | R17-03, R17-05, R17-09, R18-02; §§4–5, 12–13 worktree/config preservation |
| I03–I09, I13, G04–G05 | R17-07–R17-15, R18-02, R18-10–R18-11; §§5, 12, 14 credential security and reuse; cron completion remains T07 |
| I11–I12 | R14-02–R14-07, R17-10, R17-15, R17-33; §§11, 14–15 JSON, inherited credentials, startup/build isolation |
| E01–E04, E07 | R17-33, R17-35–R17-36, R17-38–R17-39; §§6, 8, 10, 12 empty snapshot and source-independent reads; populated integrity remains T03/T05 |
| E05–E06, G01–G03 | R17-21, R17-23–R17-26, R18-07–R18-08, R18-11; §§8, 13 commit point, stable synchronization and fresh worktrees |
| I12, G01 | R15-11–R15-14, R17-01–R17-02, R18-09; development compile proof only, full installation/target acceptance remains T08 |

Ready frontier: D03 experiment plus independent T01 work. Next conditional vertical slice: T02 after T01 and D03. T03–T10 remain mandatory and provisional as recorded in the plan.

## Step 5 independent T01 contract

Before D03 is resolved, implement only pure argument parsing, redacted error
serialization, physical worktree discovery and repository config validation.
Tests cover I10/I11 at the module boundary, malformed nearest markers, normal
and linked worktrees without Git subprocesses, config preservation and invalid
values. These checks are partial T01 evidence, never I01–I13 completion. No
credential or snapshot save is wired behind an unproved native primitive.
