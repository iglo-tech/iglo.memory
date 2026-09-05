# Retrieval v2 — approved Qwen hybrid stack

## goal

Implement the user's approved Qwen + BM25 + reranking stack in the existing
standalone Bun CLI and implementation PR #2. This September 5, 2026 amendment
supersedes conflicting choices in the parent, foundation, delivery, token-budget
and BGE-M3 specifications. The agent-evaluation amendment remains authoritative.

## non_goals

No new inference provider account, local product model runtime, database service,
SDK framework, additional search mode, QMD timing sweep or benchmark restart.
Do not replace an unresolved acceptance gate with a model leaderboard claim.

## decisions

- Default embeddings: OpenRouter model `qwen/qwen3-embedding-8b`, full default
  4096 dimensions initially. Discover and validate actual dimensions; no automatic
  dimension reduction. Keep explicit custom embedding configuration. New init
  selects Qwen; existing user configuration is never silently rewritten.
- Retain D03 prepared BM25 across body, headings and paths, including prose.
  Restore R08/AC05 after the superseded BGE amendment. Preserve identifier aliases;
  dense retrieval must never depend on lexical matches. No claim that the initial
  unstemmed tokenizer solves Polish morphology.
- Default reranker: `voyageai/rerank-2.5` via OpenRouter `/api/v1/rerank`.
  Existing OpenRouter credential resolution remains the only credential path.
  A dedicated score/index response replaces Luna's generated selection JSON.
  Optional `retrieval.model` now means the reranker model ID; incompatible custom
  routes fail explicitly. Changing the reranker alone does not require prepare.
- Qwen queries use a versioned English retrieval instruction followed by the
  unchanged original question. Documents use bounded deterministic context and
  complete source text without the query instruction. Exact formatting, tokenizer,
  route limits and refusal of silent truncation are T02-Q obligations. OpenAI's
  cl100k counts and observed limits do not establish Qwen limits.
- Initial production pipeline embeds the original question, independently retrieves
  up to 40 cosine and 40 BM25 candidates, applies D05 protected fusion to at most
  40 complete passages, then reranks against the original question. Keep the union
  of the top eight from each original channel. Equal original-list weights retain
  D05's rank constant 60 and deterministic source/offset ties.
- R09 is amended from mandatory generative expansion to an evidence-driven
  development experiment. T04 must record whether expansion addresses observed
  misses; it is not a required production stage or extra API call in the approved
  initial stack. Preserve original-query protection, literal fidelity and R10.
  If justified later, specify and verify expansion before integrating it; retain
  the existing Luna experiment as evidence, not an automatic runtime dependency.
- R11/AC07 require locally validated unique in-range document indices and finite
  relevance scores mapped only to snapshot passages. Request all candidate scores
  so filtering/diversity never depend on a provider's implicit top-eight cutoff.
  T02-R freezes the exact response contract and full-body request envelope.
- Dedicated rerankers rank even irrelevant documents. Empty results therefore
  require an explicit relevance-selection policy, not unconditional top eight.
  T05 specifies this policy on development evidence and T06 freezes its threshold
  and uncertainty before held-out access. Scores are not calibrated probabilities.
  Valid empty results, precise source-owned excerpts, multiple useful passages per
  file and ordinal public scores remain mandatory. No silent fallback on errors.
- Preserve D01/D08 atomic schema-2 publication, compatible vector reuse, source
  coordinates, worktree isolation, snapshot-only search/status/GC and all D07
  deadlines/retry/redaction outcomes for active stages. No generated evidence.
- Preserve all 80 original questions, judgments and held-out separation. Add a
  small separate agent-reviewed bilingual development supplement for Polish
  inflection, Polish-to-English retrieval, identifiers and unanswerable cases.
  It does not replace or leak the original held-out benchmark.
- Reuse saved baseline/QMD evidence. Only missing eventual held-out QMD outputs
  may run once; preserve failures and do not repeat them for timing. No QMD runs
  during contract work. Focused provider probes have a declared budget, not the
  historical exhaustive Luna matrix. G05 measures actual 4096-dimensional scale;
  old 1536/3072 measurements cannot establish the new default's overhead.

Evidence: [research synthesis](../../.ai/research/retrieval-stack-2026-09-05.md),
[Qwen model contract](https://huggingface.co/Qwen/Qwen3-Embedding-8B),
[OpenRouter embeddings](https://openrouter.ai/docs/api/api-reference/embeddings/submit-an-embedding-request),
[Voyage reranker](https://blog.voyageai.com/2025/08/11/rerank-2-5/).
Published benchmarks motivate this choice; project quality remains unverified.

## acceptance_criteria

1. T02-Q proves bundled offline token budgeting, exact Qwen query/document inputs,
   finite ordered vectors, dimensions, bounded batching and explicit size failures.
   No cl100k approximation or silent body/query truncation.
2. T02-R proves the served rerank route accepts complete bounded candidates and
   original query; malformed, duplicate, missing or out-of-range results fail.
   Empty selection behavior is separate from transport success.
3. T03 proves full normalized source coverage, schema-2 atomicity, compatible reuse,
   BM25 hand-calculated scoring, and original hybrid retrieval without source reads.
4. T04 proves protected fusion and records the expansion experiment/no-action
   decision. T05 proves no-answer selection, diversity, exact excerpts and errors.
5. T06 retains baseline improvement and QMD-relative gates, frozen before held-out
   access; failed/inconclusive results block rollout. T07 retains standalone,
   migration, terminal, clean-machine and actual-dimension scale proof.

## next_slice

Reopen only changed T02 contracts. Two independently owned sub-slices may execute
in parallel: T02-Q embedding contract and T02-R rerank contract. Both produce
focused evidence and proposed reusable transport/budget interfaces; no production
integration until verification, all three reviews and the T03 detail pass.

## tasks

| Task      | Updated work                                                                                                | State / exit                                                |
| --------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| RV2-T01   | Retain reviewed corpus, 80 agent-reviewed labels and native comparators                                     | Complete; evidence through ebe94cf, reviewed before 824ed1c |
| RV2-T02-Q | Qwen tokenizer, formatting, input/aggregate safety, batching, dimension and bounded route probe             | Ready; publish exact contract and bundled proof             |
| RV2-T02-R | Voyage rerank request/response, complete candidate envelope, errors, usage and bounded route probe          | Ready; publish contract and no-answer calibration inputs    |
| RV2-T03   | Lossless contextual passages, schema-2 provenance/reuse/migration, prepared BM25 and original vector search | Depends on reviewed T02-Q/R; detail before code             |
| RV2-T04   | Protected original fusion, candidate diversity, total deadline; evidence-driven expansion decision          | Depends on T03; no mandatory expansion call                 |
| RV2-T05   | Dedicated rerank integration, development relevance filter, precise diverse excerpts and strict failures    | Depends on T04 and T02-R                                    |
| RV2-T06   | Bilingual development supplement, controlled ablations, frozen gates and held-out evaluation                | Depends on T01–T05; no rollout on failed/inconclusive gates |
| RV2-T07   | Migration/reproduction docs, standalone/terminal/clean-machine proof and 4096-dimension scale               | Depends on T06 pass                                         |

## dependencies

T02-Q and T02-R use existing development material and OpenRouter credentials;
neither depends on the other's work. T03 remains blocked until both changed
contracts close G01/G02. Historical T02 Luna/OpenAI evidence stays retained, but
cannot close new model-specific gates. One implementation branch/PR, no merge.
Before every new implementation slice, update detail and task state, then verify
real behavior and run all three independent read-only review skills on one snapshot.

## open_questions

T02 owners resolve exact route/tokenizer/truncation/capacity contracts from primary
sources and small probes. T05/T06 own score-based abstention calibration and measured
hybrid benefit. No new provider setup, human testing or owner decision blocks work.

## qa_procedure

Use public development content and isolated storage. Check contract fixtures and
one small complete provider payload per route; add a boundary/failure probe only
for a specific unresolved limit. Record spend ceiling, observed usage and unknowns.
Build an isolated executable to prove tokenizer assets are bundled. No QMD runs.
For product slices, run prepare twice, multilingual/identifier/no-answer search,
source-removal snapshot proof and migration/failure checks, followed by configured
checks. Agent reviewers adjudicate source content; no human assignment gate.
