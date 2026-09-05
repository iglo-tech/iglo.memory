# Intake: execute the iglo.mem plan

Original request (verbatim): `execute the plan`
Source: user, deliver-a-project run 32300cb2-2dd7-4247-916f-58dd56d533ae, step 1/8.
Interpretation grounded in repository evidence: execute the completed plan from the preceding plan-a-project run, covering the entire PRD; do not repeat planning from scratch or stop after T01.

Classification: feature
Item: Deliver the complete iglo.mem repo-local semantic memory CLI.
Priority: normal (inferred; no deadline supplied).
Risk: high — secret storage/TTY, atomic snapshots, concurrent processes, deterministic chunk/profile identity, relevance and standalone portability.
Status: ACTIONABLE
Issue: none
Next: build
Setup: READY (configuration preflight, not product verification).
Shaping/specification: existing full brief and T01/T02 spec can be reused; later task contracts still require specification at their frontier. No user answer is required for the current frontier.

## Source preservation

- Full PRD read: all 18 sections, 663 lines. [Pinned source](https://github.com/iglo-tech/iglo.mem/blob/12f3514c91ae138f0c7c4729224c4279065b278f/PRD.md).
- PRD SHA-256: `08c10e1cc1381b05099b5e00d192c7c62f1ddae99d46b271982be01ca5942127`. PRD is identical on both branches and unchanged.
- Full existing plan and T01/T02 spec read. Planning revision: `eb51ee25b06dd8faacbb03e8fcdbaee84e5da77b` on `cez/6a73475b`.
- Seven planning artifacts copied byte-for-byte from that revision into this worktree: briefs/iglo-mem.md, briefs/iglo-mem-design.md, research/prd-feasibility.md, specs/iglo-mem-next.md, work/iglo-mem/plan.md, work/iglo-mem/coverage.md, work/iglo-mem/resume.md (all beneath .ai).
- Their planning-only workflow limits and old NEEDS_SETUP/branch notes are historical. This intake and CEZ_HANDOFF_FILE supply the current delivery authorization, branch and setup state. Requirements, unresolved decisions and provisional contracts remain intact. Next planning step should update their state without dropping coverage.

## Full requested scope and acceptance summary

- Ship a Bun/TypeScript CLI compiled with `bun build --compile src/cli.ts --outfile dist/iglo.mem`. The downloadable executable requires no Bun, Node, package manager, database, daemon, local model, or mandatory third-party executable at runtime.
- Expose only init, prepare, search, status, gc, plus explicit init credential reset. Every command emits JSON stdout and stable JSON errors with nonzero exits; prompts and diagnostics go to stderr and never expose keys.
- Init preserves configuration and Markdown, creates `.agent/memory.json` and knowledge/decisions/inbox/memory-index directories, and makes no API calls. Default model: openai/text-embedding-3-small. Environment key overrides shared `~/.config/iglo.mem/credentials.json`; only interactive init may prompt/save/reset. Hidden entry, cancellation/echo restoration, atomic owner-only storage, symlink rejection, worktree exclusion, invalid-storage errors, failed-save preservation, cross-repository reuse, and noninteractive behavior are all required.
- Prepare alone scans knowledge/decisions Markdown, excludes inbox/index/secrets/dependencies/build outputs, normalizes LF, chunks headings deterministically with intact code blocks, paragraph splitting at 5,000 characters and 500-character overlap for oversized sections, and hashes the formatted project/file/section/content input. Never edit source Markdown.
- OpenRouter is the sole API. Documents use batches of 64; query input is one element. Map returned vectors by index, reject malformed indices and invalid/zero/nonfinite/wrong-dimension vectors. Use bounded timeouts/retries, exponential backoff and Retry-After for transient failures; permanent failures do not retry. Credentials are needed only for requests outside init setup.
- Persist text and metadata in a complete versioned snapshot with project, timestamp, profile, document count and active chunks. Store content-addressed little-endian float32 vector files under `.agent/memory-index/vectors`. Profile identity includes endpoint/model/dimensions/input/chunker/normalization; incompatible profiles never mix. Preparation discovers dimensions; empty snapshots may have null dimensions.
- Incremental preparation reuses unchanged valid vectors with zero document API calls. Only affected chunks re-embed. Deletions affect results after successful preparation. Validate all files before atomic snapshot publication; failed preparation preserves the prior usable snapshot. Orphan vectors remain reusable or collectible.
- Search validates and loads the current worktree snapshot/vectors, embeds only the query, combines 0.80 cosine weighting with fixed exact phrase/token/heading/filename bonuses, deduplicates by file and returns at most eight relevant snippets with score, source, heading, lines and preparedAt. Empty valid snapshots return [] without an API request. Query failures, missing/corrupt/incompatible data fail explicitly without repair, partial results or lexical fallback.
- Search and status never scan Markdown or detect freshness, mutate the index, embed documents, or prepare automatically. Search works when sources are changed/deleted/unreadable, using stored text and stale locations. Status reports prepared metadata and vector availability without remote requests.
- GC removes only vectors unreferenced by the published snapshot and refuses deletion with a missing/invalid snapshot. Worktree-local bounded locks coordinate preparation through publication, loading for search, and GC. Separate worktrees own separate snapshots/vectors/locks and never combine results. Atomic vector writes must prevent corruption.
- Up to 10,000 active chunks use linear cosine scanning in under one second excluding query API latency. Only active vectors enter the search set. No background watcher, scheduler installation, hooks, multiple search modes, LLM reranking, or automatic knowledge curation.
- Document remote disclosure: document chunks go to OpenRouter/serving provider on prepare and queries on search. Deliver automated tests for all section 17/18 scenarios: credentials/reset/redaction, API failures, incremental behavior, unavailable sources/indexes, profile changes, failed publication, worktree isolation, and concurrent prepare/search/gc, plus standalone executable proof.

## Existing work and duplicate check

- GitHub all-state issues and PRs both returned empty lists. No duplicate issue/PR links. No tracker item created: this workflow requests tracker tasks only when requested.
- Remote heads: only main at `12f3514c91ae138f0c7c4729224c4279065b278f`.
- Existing matching plan: [.ai/work/iglo-mem/plan.md](plan.md), originating on `cez/6a73475b` at `eb51ee25b06dd8faacbb03e8fcdbaee84e5da77b`. It has 11 tasks T00–T10 and a coverage table recording 294 PRD units. These counts describe planning, not verified product evidence.
- Other worktree has completed planning only; no implementation claim/PR found. Reuse its artifacts, leave its branch/worktree untouched.
- Current branch `cez/32300cb2` starts at `12f3514c91ae138f0c7c4729224c4279065b278f`. Tracked baseline has PRD and skills only; no source, manifest, tests or CI. No applicable AGENTS.md found.

## Setup and dependencies

Applied installed setup initializer, adopted `.ai/skills.json` and all four artifact paths, then ran `check.ts --require-setup`: exit 0, Status READY. Installed tool execution uses `npx --yes bun@1.4.2`; observed version 1.4.2. Node is v20.19.2. Bun is available via npm cache/invocation, not globally on PATH. Do not use bare `bun` until PATH is configured.

Actual configured validation commands:
1. `npx --yes bun@1.4.2 /home/cezar/cezar/projects/iglo.mem/.agents/skills/setup/scripts/check.ts --require-setup`
2. `git diff --check`

Both passed. These are bootstrap checks only. No product tests/build/lint exist yet; build must add and run real product commands as tooling is created and update the config. Browser provider omitted for this CLI. Tracker: GitHub iglo-tech/iglo.mem. Domain experts: none; PRD and existing design supply the domain contract. No required installed skill is missing. `rg` unavailable; use find/git/Python fallback.

Required gates carried forward:
- D01 before T03: oversized indivisible Markdown and exact overlap conflict; rejecting inputs remains a proposal, not an approved PRD amendment.
- D02 before T08/release: supported OS/architecture and secure ACL/TTY/filesystem proof; development Linux is not a release scope reduction.
- D03 before T02, also relevant to T01 credential-save locking: demonstrate bundled race-safe process-lifetime locks; do not infer safety from stale-lock timestamps.
- D04 before T03: populated snapshot/vector receipts, profile/dimension bootstrap and orphan reuse contract.
- D05 before T05/T09: ranking/snippets/relevance and named benchmark hardware.

No no-action outcome or current human blocker. Gates block their dependent work until resolved; they do not justify discarding scope. Research step should inspect existing cited findings and refresh only facts needed for these gates. No external API compatibility claims were independently verified during intake.

## Next execution

Continue runner step 2 research with preserved artifacts. Then reuse/refresh design and plan, reconcile T00 evidence and start T01 secure initialization through build. Full delivery follows all T00–T10 requirements and reviews, using this worktree and one implementation PR. Stop at PR readiness unless user requests merge. No production code, API request, PR, commit, product test or release was made by intake. Last product-verified commit: none.
