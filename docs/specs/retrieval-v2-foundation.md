# Retrieval v2: first ready slices and evaluation protocol

Current direction: [approved Qwen hybrid stack](retrieval-v2-qwen.md) supersedes
conflicting model, expansion, reranking and capacity choices below. The current
task frontier is in [delivery](retrieval-v2-delivery.md).

Evaluation authority: the [agent evaluation amendment](retrieval-v2-agent-evaluation.md)
supersedes human testing, review and custody requirements below.

Status: implementation pending. Parent contract: [retrieval-v2.md](retrieval-v2.md).

## goal

RV2-T01 establishes reproducible comparative evidence before tuning retrieval.
RV2-T02 validates the requested Luna-low inference contract at realistic payloads,
so passage construction and full retrieval can be specified against known limits.

## non_goals

No production retrieval changes in these slices, new product search flags, QMD
runtime dependency, synthetic-vector relevance claims or automatic model selection.

## decisions

### T01 — Corpus and labels

Select public/non-sensitive Markdown from iglo.mem at baseline
`9670f625661e46935ec1523bb70c6dd8b35d48e4` and at least two unrelated project
collections. Choose the other projects for API, troubleshooting and design content,
not known wins for a retriever. Pin their commits and licenses before labeling.
No requirement to index whole upstream repositories. Include a natural long-document
case, tables, code fences, repeated terms, heading-only content and rare errors.
Keep synthetic pathological inputs in correctness fixtures, not silently in quality
scores. Select material large enough to create meaningful distractors in each
isolated project; report source bytes, documents and passage counts per system.

A versioned manifest records upstream URL, commit, license, file path, SHA-256 of
original and LF-normalized bytes, and deterministic mapping into `.agent/knowledge`
or `.agent/decisions`. Preserve a reverse path map for judgments. Compare every
system against the same mapped content and project boundaries. Keep downloaded
corpus/model data in run storage; commit licenses/manifests and reproducible fetch
instructions under docs. Do not publish private corpus data.

Prepare 80 human-reviewed questions with one primary slice and optional secondary
tags. Allocate the split as follows; keep related intent families together and
adjust individual assignments within these totals before freezing.

| Primary slice                             | Development | Held-out | Total |
| ----------------------------------------- | ----------- | -------- | ----- |
| Paraphrases                               | 8           | 12       | 20    |
| Exact identifiers, filenames, error codes | 6           | 9        | 15    |
| Ambiguous project questions               | 4           | 6        | 10    |
| Long documents / suffix evidence          | 4           | 6        | 10    |
| Multiple useful passages/facets           | 4           | 6        | 10    |
| Truly unanswerable                        | 4           | 11       | 15    |
| Total                                     | 30          | 50       | 80    |

Question records contain stable ID, project, original question, intent-family ID,
primary/secondary tags, split, answerability, required facets and acceptable
source spans using normalized offsets. Judgments: 0 irrelevant, 1 supporting or
partial evidence, 2 direct useful evidence. Record reasoning for ambiguous and
unanswerable cases. Evidence refuting a premise is relevant; it is not an absent
answer. For multi-facet questions record which spans cover each facet.

Have a second human review labels and adjudicate disagreements. Model-assisted
drafts do not count as human review. A missing reviewer leaves T01's label gate
blocked while harness work can continue. Freeze and hash corpus, questions and
judgments. Keep held-out questions/labels outside the tuning agent's working
inputs until freeze; the evaluator controls access. Store the eventual reviewed
benchmark artifacts in Git under docs when held-out evaluation is complete.

### T01 — Comparator interfaces and execution

Implement a Bun-based evaluation harness isolated from the product executable.
It invokes pinned binaries/processes with `Bun.spawn`, captures JSON plus exit
status and elapsed time, and writes run records outside Git. No test-only endpoint
switch enters production. Wrappers may instrument separate benchmark builds;
report their exact diff and distinguish those timings from stock executable runs.

Input contract: corpus manifest hash, question-set hash, system/build/model pins,
cache regime, repetitions, output directory. A run record contains question/system
ID, timestamps, success/error, ranked returned source spans/snippets, stage timings
when available, usage/cost provenance, and cache/model-load facts. Unavailable
stage timings or usage are null with a reason, never zero or fabricated. The
runner can resume completed question/system/repetition records only when all
input hashes match; failed calls remain part of the report.

Run these end-to-end systems separately:

- Baseline executable built from the merged pin, original chunks, embeddings,
  thresholds and one-file output. Do not retrofit v2 behavior into the baseline.
- Full proposal when T05 exists, using the selected Luna-low model and native v2
  chunks. It must include expansion, both retrievers, fusion and reranking.
- Stock QMD at `dbfd0b4736aeaf761d1a16ca8e424f071df8feb9`, `query` full mode,
  default embedding/expansion/reranking models installed and ready, no no-rerank
  option. Pin runtime, model artifact URIs/checksums, hardware and exact commands.
  Capture explain/hooks for actual bypasses. Native strong-signal expansion
  bypasses remain stock behavior and must be disclosed, not patched away.

The [pinned QMD implementation](https://github.com/tobi/qmd/blob/dbfd0b4736aeaf761d1a16ca8e424f071df8feb9/src/store.ts#L5438)
uses typed expansion routing, file candidates and reranking; its
[local model implementation](https://github.com/tobi/qmd/blob/dbfd0b4736aeaf761d1a16ca8e424f071df8feb9/src/llm.ts)
differs from remote ID selection. Install its local models only in evaluation
storage. A missing full QMD run blocks the comparative report; do not substitute
keyword-only QMD and label it full mode.

Measure top 1/3/5/8 returned evidence, not hidden full files. Map baseline/QMD
locations and excerpts into frozen source coordinates. Ambiguous mappings require
manual adjudication; never guess a favorable span. Pool top-eight results from
all systems, randomize and blind system identity for relevance review. Novel
unjudged passages must be adjudicated before scoring. Preserve the initial labels
and publish adjudication changes separately to expose pooling bias.

### T01/T06 — Metrics and controlled comparisons

For answerable questions report useful-result presence@1/3/5/8 (at least one
judged grade-2 result), nDCG@8 with gains 0/1/3, and answer-facet recall@8. Supporting
presence (grade ≥1) is a separate diagnostic. Span recall counts unique labeled
spans covered, without rewarding overlap twice. Candidate recall@40 measures
whether the reranker ever sees the needed evidence. A result covers a labeled
span when its returned evidence contains that span, or an adjudicator explicitly
labels its shorter excerpt sufficient. State which metric uses candidate full
text versus presented excerpts. Report both when clipping changes usefulness.

For nDCG, collapse duplicate evidence for the same source span; later duplicates
get no extra gain. Compute ideal ranking from judged evidence units for that
query, documenting incomplete pooling. Do not use irrelevant unanswerable queries
in answerable nDCG averages. For absent answers report nonempty-return rate and
separately misleading-result rate (human judges result falsely suggests the
missing answer). A correctly refuting passage is not misleading. Search errors
count as failures, not correct abstentions; include all answerable failures as
zero usefulness and show unanswerable success/failure denominators explicitly.

Show per-project/per-slice counts and paired query bootstrap 95% intervals with
fixed seed, grouping repetitions under their question. These 50 held-out questions
cannot establish tiny improvements confidently. Report raw paired win/tie/loss
counts as well as means; never hide exact-identifier or no-answer regressions.

Controlled ablations use identical v2 passage spans and stored document vectors,
with one shared set of original query vectors. Expansion-enabled variants share
expansion strings/vectors too; report that added query information explicitly.
Compare baseline scoring adapted to shared passages, BM25+vector, added expansion
and protected fusion, then full reranking. Keep original native baseline results
separate. Measure chunk/context-only changes against the same embedding model,
while acknowledging that changed inputs necessarily change vector values.

An optional QMD-derived shared-input adapter must document every divergence
(native chunk selection, file deduplication, fusion, reranking, embeddings).
It is an experimental adapter, not stock QMD or proof that only one algorithm
differs. If identical-input stock QMD cannot be run, report that limitation and
complete controlled iglo.mem ablations plus stock end-to-end comparisons.

Measure whole CLI p50/p95/max, local load/ranking, per-stage time, failure rate,
input/output/reasoning/cached tokens, retries and billed USD. Preserve unknown
costs as unknown; price-based estimates are labeled estimates. Include preparation
time/cost, unchanged-prepare zero-call reuse, and edited-section reuse. QMD API
cost may be zero; report hardware, memory/VRAM, model load and execution time.

Keep three regimes separate: new process/model-cold, novel query with warm models,
and repeated queries with warm caches. Record rather than assume OS cache eviction
and provider cache behavior. Use at least three repetitions per development query
for representative CLI timing; report sample count and tail uncertainty. Never
compare QMD repeated-cache timing with novel-query iglo.mem as one unlabeled score.

### T02 — Exact provider contract and measurement

Default: `openai/gpt-5.6-luna`, `reasoning: { effort: "low" }`,
for both expansion and reranking. No older-model experiment. [Official model docs](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
confirm low reasoning. The [OpenRouter catalog](https://openrouter.ai/api/v1/models)
and [Luna endpoints](https://openrouter.ai/api/v1/models/openai/gpt-5.6-luna/endpoints)
returned this exact model with reasoning and structured-output parameters on
2026-09-05. This verifies advertised availability, not account-specific live
schema success. Existing OpenRouter credentials remain the only planned key.

Use [OpenRouter's reasoning field](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens),
strict schemas and required-parameter routing from the parent spec. Omit temperature:
it is not listed for this route. Do not fall back to medium/default reasoning.
Reserve output budget for both reasoning and visible JSON. Start probe caps at
2,048 total completion tokens per stage; measure length/refusal failures before
freezing a cap. Use the exact schemas and prompts in D04/D06. Record request parameters and hashes.

Observed standard catalog pricing is $0.20/M input and $1.20/M output; route prices
vary. At those rates, 20,000 input plus 2,048 output tokens costs about $0.00646
for reranking alone. This is arithmetic, not measured Luna usage; expansion,
query embeddings and retries add cost. Measure Luna latency and usage in T02.

Use the development corpus to form 8/24/40 complete-candidate payloads across
300/500/700-token passage sweeps, with heading/path context included. Use at least
10 distinct development questions per payload cell, and 30 expansion calls across
the development questions. Candidate sets include hard distractors, correct
negative evidence, absent answers and injected instructions. Record candidate
position variants separately. Sweep only the selected Luna-low model. Freeze a
spending estimate from the serialized payloads before executing the harness;
stop and report if its declared ceiling is reached, without silently reducing
question coverage.

Publish exact tokenizer package/version/license and bundled artifact hashes,
verified model mapping, wrapper/context shortening format, per-input and aggregate
embedding limits, chat prompt/output envelope and custom-model policy. Sources
must be provider documentation plus boundary probes, not tokens≈characters.
Demonstrate compilation without external tokenizer assets. If mapping or limits
remain uncertain, research them before T03; uncertainty cannot become a claimed
safe hard limit. Probes include multilingual/Unicode, long code, long headings,
paths, queries, size-error batch repartition and a minimum-unit failure case.

Test valid empty outputs, exact literals, unique known IDs, schema extra fields,
non-string values, refusal, truncation, duplicate IDs, unknown IDs, network errors,
429/Retry-After, 5xx, permanent errors and deadline exhaustion. Use a controlled
transport for deliberate malformed responses; do not depend on a model producing
an invalid response on demand. Measure live completion validity separately from
human relevance. Persist no secrets or full private text.

## acceptance_criteria

| ID  | Given / When / Then                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F01 | Given the manifests, when a fresh evaluator fetches material, then commits/licenses/hashes/path mappings reproduce exactly; mismatch stops the run.                                                                |
| F02 | Given the 80 questions, when label validation runs, then primary totals and 30/50 split match, intent families do not cross splits, all positive spans resolve, and human review/adjudication is recorded.         |
| F03 | Given pinned baseline and QMD, when development questions run, then native full-mode outputs, actual bypasses, errors and cache facts are captured; neither system is silently replaced.                           |
| F04 | Given hand-judged toy runs with overlaps, missing answers and failures, when scored, then presence/nDCG/facet/misleading metrics match hand calculations and retain failures.                                      |
| F05 | Given a partial run, when resumed with matching hashes, then it completes missing records without overwriting observations; changed inputs require a new run.                                                      |
| F06 | Given T01's results, when reviewed, then reproduction docs, frozen labels and baseline report exist; missing human/QMD evidence blocks verification.                                                               |
| F07 | Given Luna-low exact requests, when sent through the existing key, then served model/route, reasoning setting, schema validity and usage are recorded; unavailable support blocks T02 without model substitution.  |
| F08 | Given all payload cells, when measured, then candidate text is complete, token/latency/cost distributions include reasoning and failed calls, and 40 protected-capable candidates fit the frozen default envelope. |
| F09 | Given source/provider edge inputs, when budgeted/split, then no source suffix is lost, no character approximation is claimed exact, and tokenizer assets remain inside the executable.                             |
| F10 | Given malformed/hostile responses and timeouts, when validated, then D04/D06/D07 behavior holds; valid empty arrays succeed and raw provider text never becomes evidence.                                          |
| F11 | Given T02's decision, when T03 is specified, then every G01/G02 limit has a cited/probed contract or T03 remains blocked.                                                                                          |

## next_slice

Start RV2-T01 with manifests, span judgments and a baseline-to-report thin path,
then add pinned stock QMD to the same report. T02's public-payload/contract work may
proceed independently; its representative exit depends on T01 development data.
After both are reviewed, specify T03 against their actual capacity decision.

## tasks

T01 links R16–R19,R21 and F01–F06. T02 links R07,R09,R11,R13–R16,R20–R21 and
F07–F11. These are vertical outcomes; internal harness/label/probe steps are not
separate tracker tasks. Later stable tasks remain in the parent specification.

## dependencies

T01: public Git sources/licenses, reviewer, pinned baseline build and a QMD-capable
evaluation host. T02: selected-model route/account access and T01 development data.
Research can resolve provider/tokenizer questions without altering product code.

## open_questions

The two external corpus selections, reviewer and QMD host are execution assignments
for T01. Tokenizer mappings, exact capacity and live Luna-low production-schema
support are T02 gates. Current catalog evidence does not close those gates.
The requested model/effort is resolved and must not be retuned without the owner.

T06 must freeze numeric release margins after development runs and before any
held-out scoring. Minimum direction: held-out useful-result@8 and nDCG@8 improve
over baseline; exact-identifier usefulness and misleading unanswerable rate do not
regress. Set practical minimum effect and uncertainty treatment from development
counts, then commit the immutable gate. Also freeze p95 cost/latency limits
(initial goals $0.01/search and 5 s) and allowed error rates. Never relax a failed
gate after reading held-out results. A revised design requires a new held-out set
or an explicitly exploratory report. Missing measurements prevent default rollout.

## qa_procedure

On a fresh evaluation directory, reproduce manifests and builds, validate labels,
run one question from each slice through baseline and stock QMD, and inspect exact
source mapping. Run hand-calculated metric fixtures and resume/mismatch checks.
Execute the full development benchmark only after those pass. Independently review
labels and results with system identities hidden.

For T02, reproduce exact serialized prompts/schemas, validate malformed-response
fixtures locally, then run the declared Luna-low matrix. Inspect usage, reasoning
budget, candidate completeness and suffix/identifier handling. Publish the durable
capacity/reproduction decision in docs; keep raw responses and timings in run
storage. Verify T01/T02 against the recorded evidence.
