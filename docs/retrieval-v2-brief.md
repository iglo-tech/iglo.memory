# Retrieval v2 brief

Status: specified in [retrieval-v2](specs/retrieval-v2.md); no implementation or quality claim.
User correction during specification: use GPT-5.6 Luna with low reasoning for
both chat stages. Earlier-model probes are historical evidence only.

## Problem, users, outcome

Coding agents need passages that answer project questions, including questions
whose wording differs from the documentation. Developers preparing a worktree
need predictable updates and one credential setup. The current search uses
cosine similarity plus fixed lexical bonuses, returns one passage per file, and
clips excerpts from the start. Correctness tests and two live queries do not
show how often useful evidence is found.

Improve useful evidence in the first eight results while preserving the existing
`init → prepare → search` workflow. Search returns evidence, not generated answers.
Use QMD's full retrieval mode as a measured comparator, not an architectural
definition of success. This brief covers the entire next version, not one slice.

Starting point: merged baseline `9670f625661e46935ec1523bb70c6dd8b35d48e4`,
[README](../README.md), [PRD](../PRD.md), [decisions](decisions.md),
[verification](verification.md), and [AGENTS.md](../AGENTS.md). The new request
supersedes the PRD's exclusion of expansion/reranking. Existing accepted behavior
stays authoritative until explicitly superseded by the v2 specification.

## Preserved contract and journeys

- Download one executable; install no language runtime, local model, database
  service or daemon. Keep the currently supported Linux x86_64 platform scope.
- Run `init` once to save the shared external OpenRouter key; other worktrees
  reuse it. Keep the environment override and existing credential safeguards.
- Run `prepare` explicitly after edits. It scans the existing Markdown roots,
  derives passages, lexical data and missing embeddings, then publishes one
  complete worktree-local generation. Failure preserves the prior generation.
- Run one `search "question"` with sensible defaults. It loads prepared data,
  releases the lock before inference, and returns JSON evidence or a nonzero
  JSON error. It never reads Markdown, checks freshness, repairs the index or
  persists query caches. A valid empty snapshot needs no remote calls.
- Locations describe prepared content. Changed, deleted or unreadable sources
  do not change search behavior until preparation. Missing, corrupt and
  incompatible snapshots remain distinct actionable errors.

No graphical UI is involved. Preserve JSON stdout, stderr diagnostics, hidden
credential input and noninteractive prepare/search. Document that remote
reranking now sends selected prepared passages during search as well as queries.

## Full scope and shaping decisions

1. **Passages and embeddings.** Use one deterministic Markdown pipeline with
   project, path and heading ancestry as context. Preserve all source content,
   including heading-only sections, large fenced blocks and single long lines.
   Split into traceable spans when required by provider limits; never drop a
   suffix or reject a document merely for length. Separate occurrence identity
   from embedding-input identity so repeated text has distinct locations and
   unchanged inputs can reuse vectors after location-only edits.
2. **BM25.** Derive passage postings and corpus statistics during prepare.
   Specify whole identifiers plus components for camelCase, underscores, paths,
   filenames and error codes; version tokenization and field rules. Start within
   the current snapshot architecture, retaining linear vector search.
3. **Expansion.** Use model-generated complementary project-documentation queries
   in addition to the original. Preserve exact identifiers and negation. Keep
   the original question outside model control and independently retrieved.
4. **Fusion.** Combine lexical/vector passage lists for the original and valid
   expansions. Explicitly protect original candidates through the cap; higher
   weights alone do not ensure survival. Deduplicate overlapping evidence,
   allowing several useful passages from the same file.
5. **Reranking.** Rank against the original question. Supply bounded complete
   candidate passages as untrusted data. Models return ordered validated IDs,
   never authoritative text, paths or locations. Permit an empty selection and
   useful evidence that refutes a question's premise. Do not treat model scores
   or baseline cosine thresholds as calibrated answer probabilities.
6. **Presentation.** Return up to eight useful passages with snapshot-owned
   excerpts and precise locations. Define overlap handling, semantic-query
   excerpt fallback and score compatibility in the specification.
7. **Failure policy.** Retain strict failures for required embedding, expansion
   and reranking stages. No lexical-only, skipped-stage or cross-model fallback.
   Specify bounded retries and a total search deadline. Valid empty expansion
   or selection is distinct from malformed output, refusal or timeout. Same-model
   provider routing is not permission to omit a retrieval stage.
8. **Migration and configuration.** Prepare owns schema migration and lexical
   rebuilds; search rejects incompatible generations with re-prepare guidance.
   Reuse only validated compatible embeddings. Keep one optional retrieval model
   setting shared by expansion/reranking; no user-facing pipeline tuning panel.

Architecture ownership and affected contracts are recorded in the
[design note](retrieval-v2-design.md).

## Selected model and assumptions to test

The model/effort is fixed by the owner. Numerical settings are development
starting points, not measured optima or release promises:

- Retain `openai/text-embedding-3-small`; use `openai/gpt-5.6-luna` with low
  reasoning for expansion/reranking, as requested by the owner. The exact ID,
  reasoning and structured-output support were catalog-verified on 2026-09-05.
  Live production-schema and representative payload measurements remain T02.
  Do not run Gemini 2.5 or GPT-4.1 mini as challengers.
- Test roughly 300–700-token passages, two expansions, conventional BM25
  parameters and rank fusion with original-list weighting. Start with 40
  candidates, protecting the top eight original lexical and vector candidates
  before filling remaining slots. Test a soft two-passage-per-file preference;
  it must not discard necessary answer facets or override protected slots.
- Aim initially for p95 full search of five seconds and $0.01 per search. These
  are experiment budgets pending representative measurements, including retries,
  embedding calls, long candidates and provider routing. They are not SLAs.

Historical evidence only, superseded for model selection: the prior 24-request public-text probe had six calls per model/stage. Gemini
median expansion/rerank times were 505.5/388.5 ms; GPT mini was 879/950.5 ms.
Rerank inputs were only about 1,940 tokens. All outputs passed structural checks,
yet both models drifted toward human-memory advice for “refresh memory.” This
supports better project framing and quality evaluation, not a production latency
or relevance conclusion. Exact probes and outputs remain in untracked run storage.
Current model references: [Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna),
[OpenRouter routes](https://openrouter.ai/api/v1/models/openai/gpt-5.6-luna/endpoints),
[structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs).

## Alternatives and non-goals

- **Do nothing:** simplest operationally, but leaves the requested quality work
  and comparative evidence undone. Retain it as the measured baseline.
- **Improve chunks and lexical bonuses only:** smaller reversible change, useful
  as an ablation; insufficient to investigate the requested full pipeline.
- **Reuse existing OpenRouter, snapshot, vector and credential mechanisms:**
  chosen. Add lexical data and bounded chat inference without a new service.
- **Adopt QMD as the product runtime:** rejected because its local-model runtime
  conflicts with the executable constraint. Install it only in the evaluation
  environment. A database or approximate-nearest-neighbor engine is not justified
  until measurements expose a need.

Non-goals: generated answers, local inference, new source roots, cross-worktree
search/cache sharing, freshness detection, persistent query caches, background
jobs, new secret infrastructure, graphical screens, implementation in this
planning run, or a QMD parity claim before evaluation.

## Evaluation and acceptance intent

Freeze public/non-sensitive Markdown from iglo.mem and at least two other project
documentation collections, with commits, licenses, hashes and path mappings.
Keep projects isolated. Include prose, API examples, troubleshooting, decisions,
tables, repeated terms and large documents. Label source spans independently of
chunk boundaries, with relevance 0/1/2 and required answer facets.

Plan 80 human-reviewed questions: 20 paraphrases, 15 exact identifiers/paths/errors,
10 ambiguous, 10 long-document, 10 multi-passage and 15 truly unanswerable.
Use secondary tags for overlap and distinguish refutable premises from absent
answers. Split 30 development / 50 held-out questions by intent family; preserve
slice coverage. Pool results across systems and adjudicate blinded, including
newly discovered useful spans rather than declaring unjudged results irrelevant.

Compare pinned baseline, full proposal and stock QMD `query` with expansion and
reranking available. Pin QMD commit
`dbfd0b4736aeaf761d1a16ca8e424f071df8feb9`, model artifacts and runtime settings.
Record its actual expansion bypasses and cache states. Its typed expansion,
file candidate selection and local `rankAll` reranker differ from this proposal;
see [pinned implementation](https://github.com/tobi/qmd/blob/dbfd0b4736aeaf761d1a16ca8e424f071df8feb9/src/store.ts#L5438).

Separately run controlled ablations on identical chunks, document/query vectors
and labels: baseline scoring, BM25+vector, expansion/fusion and reranking. Any
QMD-derived adapter using those shared inputs must be labeled an experimental
adapter, with divergences documented; it cannot stand in for stock QMD.

Measure useful-result presence@1/3/5/8, nDCG@8, answer-facet/span recall@8,
candidate recall@40, unanswerable nonempty-return and misleading-result rates.
Report per-slice counts and paired uncertainty. Measure complete CLI p50/p95/max,
failures, per-stage time/tokens/cost, preparation cost and embedding reuse.
Separate cold process/model load, novel queries and repeated warm/cache queries;
report local QMD hardware/time costs alongside its zero inference API charge.

Release acceptance must demonstrate held-out useful-result and relevance gains
over baseline without hiding identifier or unanswerable regressions. Freeze
numerical margins after development baseline/payload measurements and before
opening held-out results. Failure to improve blocks a quality claim or default
rollout; it does not justify dropping hard product constraints. QMD differences
must be reported whether favorable or unfavorable.

Correctness acceptance remains independent: source-content coverage and exact
spans, stable cache reuse, protected original candidates, deterministic lexical
and fusion ties, hostile/invalid model responses, empty/no-answer behavior,
strict errors, failed migration atomicity, worktree isolation and search with
unreadable/deleted Markdown. Re-run standalone runtime and existing safety checks.

## Phases and remaining decisions

The next action is specification of all phases, not implementation of phase 1.

| Phase                                  | Dependency       | Testable exit intent                                                                                                                            |
| -------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Evaluation foundation               | Final spec       | Frozen corpus/labels, runnable pinned baseline and full QMD, baseline report; representative 8/24/40-candidate inference measurements           |
| 2. Prepared passages and lexical index | Phase 1 fixtures | Content coverage, provider-limit tests, schema migration and incremental reuse; shared-input lexical/vector ablation                            |
| 3. Full retrieval pipeline             | Phase 2          | Validated expansion/reranking, original-candidate protection, bounded strict failures, snapshot-owned diverse excerpts                          |
| 4. Selection and release evidence      | Phases 1–3       | Freeze model/prompts/constants and release margins on development data; held-out comparison, runtime checks and reproducible published decision |

Specification must resolve exact prompts/JSON schemas and identifier validation;
BM25 token/field statistics; candidate quotas, ties and diversity precedence;
excerpt spans and score semantics; tokenizer/provider request budgets; migration
compatibility, status/GC behavior; stage error codes and deadline/retry policy.
The Luna-low choice is fixed; numerical quality margins and final latency/cost limits need
measurement gates with owners and failure outcomes. No required user decision,
merge prerequisite or no-action outcome blocks specification.

Keep maintained specification, decisions and reproduction instructions in `docs/`.
Keep probes, execution logs, intermediate reports and handoffs in untracked Cezar
run storage. This overrides legacy configured `.ai/briefs` for this durable brief.

Next: build RV2-T01 when implementation begins
Brief: docs/retrieval-v2-brief.md
