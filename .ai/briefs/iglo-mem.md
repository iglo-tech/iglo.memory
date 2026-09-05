# iglo.mem: full product brief

Status: READY_FOR_SPEC. This shapes the entire PRD, not a first implementation slice.

Source: [PRD](../../PRD.md), §§1–18, revision `12f3514c91ae138f0c7c4729224c4279065b278f`; [research](../research/prd-feasibility.md), accessed 2026-09-05. The PRD remains the acceptance authority. [Design decisions](iglo-mem-design.md) distinguish proposed contracts from requirements.

Delivery shape refresh (step 3/8, 2026-09-05): artifact paths are adopted in `.ai/skills.json`; [T00 preflight](../work/iglo-mem/evidence/T00/setup.md) is READY with `npx --yes bun@1.4.2`. Product commands must be added in T01. No implementation or product verification exists. Full PRD §§1–18 and T00–T10 remain scope.

## Problem and outcome

Coding agents need relevant, accepted repository knowledge without reading every Markdown file or depending on a running service. Human maintainers need readable source files, explicit control over refreshes, and credentials that work across repositories without entering Git.

Ship one downloadable executable per supported target. A maintainer initializes credentials once, prepares canonical Markdown in each worktree, and an agent searches the last complete snapshot with one natural-language query. Search returns useful, bounded source excerpts even when the source files are unavailable. Failed refreshes preserve the prior snapshot.

## Users and journeys

| User / journey | Steps and intended outcome | Required states |
| --- | --- | --- |
| Maintainer, first setup | Download executable → `init` → hidden credential entry → JSON setup result → author knowledge → `prepare` | New or partial setup; environment or saved key reused; missing key without TTY; invalid storage; cancellation; failed save; successful save without implying API authentication |
| Maintainer, credential rotation | `init --reset-credentials` → hidden replacement → atomic save | TTY required; environment precedence explained; cancellation/failure preserves old key; no index invalidation |
| Agent, retrieve knowledge | From current worktree, `search "query"` → ranked snippets → optionally open reported source | Ready; valid empty snapshot; no relevant matches; missing/corrupt/incompatible index; query/API failure; busy index; stale source locations explicitly allowed |
| Agent or scheduler, refresh | Run `prepare` after worktree creation, branch switch, or source edits | First preparation; unchanged reuse; changed sections; deletions; profile changes; derived-data repair; interrupted or failed publication; bounded contention/retries |
| Maintainer, inspect and reclaim | `status` for prepared metadata; `gc` for unreferenced vectors | Complete snapshot; missing vectors; malformed snapshot; busy lock; GC refuses unsafe deletion; neither checks Markdown freshness |

There are no graphical screens and no existing product UI. The surfaces are a terminal prompt, stderr diagnostics, and JSON stdout following PRD §§11–12. Use short text and explicit recovery commands. Do not add banners, colors, spinners, interactive search menus, or alternate response formats. Keyboard-only setup must support hidden entry, cancellation and restored terminal state; explain before entry that characters will not appear. Never rely on color or cursor movement to communicate state. Test prompts with a PTY and non-TTY streams; screen-reader usability of hidden input remains a verification item. No browser/prototype exists to run ux-proof against. A disposable visual prototype would not resolve the contract gaps, so none is warranted.

## Complete scope

1. **Installation and configuration:** Bun/TypeScript, compilation with explicit disabled startup loading (see design), standalone runtime with no required Git executable, worktree discovery from cwd, preserved project configuration, configurable OpenRouter model with the required default.
2. **Credentials and privacy:** environment precedence; shared home-based owner-only storage outside any worktree; hidden interactive init/reset only; atomic saves; reject insecure/unreadable/malformed or symlinked storage; cancellation and failure preservation; cross-repository reuse; no key in arguments, output, logs or repository files. Document remote document/query disclosure and plaintext local credential storage.
3. **Preparation:** only the two canonical Markdown roots; all stated exclusions; source Markdown unchanged; deterministic LF normalization, headings, intact blocks, paragraph splitting, 5,000-character limit and 500-character overlap subject to the explicit conflict below; formatted-input hashing; fixed batches of up to 64; bounded retry/timeout policy; index-addressed response validation.
4. **Persistence and reuse:** complete versioned snapshot with text and source metadata; content-addressed little-endian float32 vectors; profile identity covering every PRD input; dimension discovery; valid unchanged reuse without document API calls; changed/deleted chunks reflected only after publication; repair through prepare; atomic vector/snapshot writes; prior snapshot preserved on failure.
5. **Search:** validate all active data; one query embedding; linear cosine scan weighted 0.80 plus fixed phrase/token/heading/filename bonuses; favor exact technical terms and semantic paraphrases; deduplicate by file; at most eight bounded snippets with score, source, heading, lines and preparedAt; relevance filtering. No source reads, freshness detection, document embedding, repairs, writes or fallback. Empty valid snapshot needs no credential/API request.
6. **Operations:** JSON results and stable JSON errors/nonzero exits for every command; source-independent status; GC preserves published references; bounded worktree-local locking for preparation, loading and GC; independent worktrees; finite cron-compatible preparation; only active vectors searched; under-one-second vector search at 10,000 active chunks excluding query API latency.
7. **Completion evidence:** automated coverage for every PRD §§17–18 scenario, including credential PTYs/security, API response/failure cases, incremental invalidation, unavailable sources, corruption/profile changes, failed publication, multi-process contention and worktree isolation; clean standalone execution on every promised target; defined relevance fixtures and benchmark.

## Alternatives and non-goals

- Doing nothing leaves the requested retrieval and explicit preparation workflow absent. Reject.
- Reuse the Markdown/Git workflow for human authoring and the specified OpenRouter/Bun capabilities. There is no existing CLI implementation to extend. Plain text search alone cannot satisfy semantic matching; external vector tools add disallowed runtime requirements.
- Choose the smallest reversible implementation strategy: command functions, one snapshot store, immutable vectors and a linear ranker. Keep the full product scope; internal delivery ordering does not remove acceptance criteria.

Non-goals remain those of PRD §3: no local models, database, daemon, full-codebase indexing, automatic curation, direct alternative provider integration, multiple search modes, LLM reranking, background automation installation, cross-worktree search, or automatic search repair. No GUI, new user ranking knobs, tracker ceremony or production implementation in this step.

## Assumptions and remaining contracts

- **Reversible proposal:** reject unchunkable input before publication when an indivisible paragraph/block or overlap makes the size rules impossible. Never truncate or silently split code. This preserves the hard cap and intact content, but restricts accepted Markdown; specification must explicitly adopt an error contract or mark the contradiction unresolved. It is not an already approved PRD amendment.
- Count normalized content in Unicode code points; treat the formatted prefix as separate from the content cap. This is a proposed interpretation, not proof of model token-limit compliance. Specification owns exact overlap, heading/fence grammar and source-line semantics.
- Use the nearest validated worktree marker and fixed source roots; reject source symlinks rather than transmitting files outside those roots. No custom source-root settings are implied by the phrase “configured sources.”
- Proposed first target for developing and measuring the CLI is the current Linux environment. This does **not** choose or reduce release platform coverage. Specification must name promised targets and secure filesystem/terminal contracts; Windows ACL support remains unproved.
- Snapshot-only search cannot determine remote model-weight changes hidden behind the same model ID. Record that limit; do not claim immutable remote embeddings or add model discovery.
- Ranking constants/cutoff, snippet length, schemas/error precedence, dimension bootstrap, corruption checks, lock recovery and release/benchmark matrix remain specification work, with ownership in the design note. No user decision blocks shaping; none is silently treated as settled.

## Required gates and evidence ownership

| Gate | Required resolution / acceptance intent | Before |
| --- | --- | --- |
| D01 | Preparation owns accepted Markdown semantics. Resolve oversized intact blocks and exact overlap with deterministic fixtures; rejection remains a proposal, never a silent PRD relaxation. | T03 |
| D02 | Name release targets and prove owner-only storage, safe paths, terminal handling and standalone execution on each. Retain Linux x86_64/arm64, macOS x86_64/arm64 and Windows x86_64 as investigation candidates. | T08 |
| D03 | Store owns worktree locks; credentials own user-wide save coordination. Select a bundled primitive and prove bounded acquisition, killed-holder release and stable identity across atomic replacements. | T01 credential-save verification and T02 |
| D04 | Preparation/store freeze populated schema, profile dimensions, orphan evidence and corruption checks, including empty transitions. | T03 |
| D05 | Ranker owns constants, token grammar, relevance cutoff, bounded snippets and ties. Pin corpus and benchmark environment; distinguish measured quality from deterministic mock results. | T05/T09 |

T01/T08 also need a startup contract: repository `.env` and `bunfig.toml` must not supply credentials or alter CLI startup. Command/build ownership must enforce and test this in source and compiled runs with dummy sentinels. The bare PRD compile example alone is insufficient according to the research; specification must reconcile build settings without changing the product scope.

No user question blocks this shape handoff. D01 may require a product decision before implementation if a coherent accepted-input policy cannot preserve the PRD; D02 cannot silently drop unproved candidates. No required gate is closed by this brief.

## Acceptance intent and next action

Each numbered scope item must map to explicit observable tests in specification, retaining all PRD §§17–18 criteria. Verify calls and filesystem access, not only returned JSON. Separate mocked API contract tests from authenticated provider checks; separate any future prototype from production evidence. No tests, benchmarks, standalone proof or product verification have run in shaping.

Next: specify
Brief: .ai/briefs/iglo-mem.md
