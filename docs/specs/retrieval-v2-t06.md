# Retrieval v2 — T06 comparative evaluation frontier

## goal

Measure the complete approved stack against saved native baseline and full QMD,
including displayed evidence, Polish coverage, expansion effects and real failures.
Close AC11–12 only through frozen comparative evidence, not model reputation.

## non_goals

No QMD timing sweeps, model selection restart, local product inference, manual
label gate, held-out access before freeze, extra implementation PR or merge.

## decisions

T05 is verified and independently reviewed at 115768c. Its development cutoff
and snippet losses remain provisional quality evidence. Keep all earlier failed
observations and qualified judgments. First establish the exact valid saved
baseline/QMD development runs and common grading inputs; do not silently mix
recovery runs, stale manifests or old window mappings.

T06-A compares development outputs, adds a small independently agent-reviewed
bilingual supplement, and measures expansion on/off with shared prepared passages,
embedding/reranking models and presentation. Existing outputs may be replayed
when identity and equivalent behavior are proven. Provider errors remain failures,
not abstentions. Any necessary additional live request has an explicit budget and
purpose. There are no new QMD calls in T06-A.

T06-B freezes the final implementation, prompts, policy, corpus/judgments and
numeric release margins before any original held-out input is opened. Quantitative
quality, latency and cost limits must be written and committed at that frontier,
using development evidence and the user's accepted Luna latency. Do not relax them
after reading held-out results. Only then may missing native held-out outputs run
once; retain failures. Failed or inconclusive gates mean no rollout/parity claim.

## next_slice

T06-A1 traces and validates saved comparator provenance and evaluation adapters.
It produces a concrete comparison plan before changing evaluation code. Root
retains the custody boundary and specifies the follow-on implementation from that
trace. Bilingual and ablation details follow at the next resolved frontier.

## tasks

- T06-A1: independently trace saved development comparators, hashes, mappings and
  common adjudications; identify exact inputs for a valid proposal comparison.
- T06-A2: implement/replay proposal adapters and common development scoring;
  add bilingual supplement and controlled expansion ablation after details exist.
- T06-B: freeze quantitative gates, then locked held-out comparison and report.
- T07: remains dependent on passing release gates; preserve no-rollout outcomes.

## dependencies

T01–T05 reviewed. Original held-out questions remain outside current inputs.
No user input or new provider is required. The T06-A1 trace is read-only and uses
saved local evidence only.

## acceptance_criteria

Every compared result names its source/code/model/input identity. Presented
snippets and complete candidate relevance stay separate. Report per-project and
slice counts, useful evidence at 1/3/5/8, nDCG, facets/spans, unanswerable harm,
paired uncertainty and win/tie/loss. Unknown costs/timings remain unknown.
Polish support and expansion benefit require direct measured evidence, not English
leaderboards. All in-scope failed/inconclusive outcomes remain visible.

## open_questions

Exact common development inputs, valid saved QMD recovery identities, bilingual
supplement and numeric release margins remain to be resolved before T06-B.

## qa_procedure

Start with offline identity and excerpt-coordinate checks. Reuse comparator
outputs. Verify adapter metrics against existing hand-calculated fixtures and
run configured checks if code changes. Independently review every completed
slice before advancing. No held-out access until the gate freeze is committed.

## T06-A2 replay and diagnostic contract

The completed A1 trace identifies baseline `5e107a79…` (90 observations), QMD
`0fad3e35…` (87), and separate d30 recovery `a94c090e…` (3). The corrected native
presented ledger is `a680011c…`; retain recovery and interrupted-attempt accounting.
Full identifiers and validated hashes live in the trace report. Proposal records
are one calibration observation per question with a separate corrected d15.

First implement an evaluation-only proposal adapter and current-code replay.
Validate version2 passage/source ownership, exact codepoint coordinates, normalized
source substring and permitted boundary ellipses. Replay captured successful
expansion, embedding and rerank responses through current production code without
network; compare original all-eight ordering and apply the current cutoff and
presentation. Bind current source/config/snapshot/input hashes and disclose which
historical bindings were absent. Fail mismatches, never silently fetch replacement
outputs. Preserve the original d15 failure and separately name the repaired view.

The first comparison is explicitly a useful-presence diagnostic, using each
system's own declared observation count. Do not duplicate proposal rows or mix
native CLI timing with in-process timing. Full-passage and displayed-snippet grades
are separate. Native recovery sensitivity stays separate from original completed
cohorts. Shared nDCG/span/facet/harm remains unresolved until new presented snippets
have common minimal evidence units and independent adjudication.

Ownership: replay worker owns `scripts/retrieval-eval/proposal.ts` and its new test
file, plus ignored replay report/driver. Root owns integration, common-evidence
adjudication, bilingual supplement, task state and comparison diagnostics. No
production edits, API calls, QMD calls or held-out access in this replay slice.

### Common evidence adjudication

Keep the original reviewed labels and native corrections. For each newly presented
proposal snippet, two independent agents review the same source-owned text without
system scores or ranks. Each records grade, supported facets, explicit misleading
judgment, a minimal exact supporting quote for positive grades, and whether it is
a sufficient shorter rendering of an existing evidence unit. Reuse existing unit
IDs for the same fact/span rather than creating one positive unit per result.
Record genuine novel units with exact source offsets; deduplicate overlapping
copies of the same unit. Grade-zero mappings require explicit review but add no
positive denominator. Root adjudicates disagreements against source text before
common graded metrics. A positive grade without a supporting quote or equivalent
existing unit cannot be silently treated as span coverage.

The first common-review packet contains 187 current-cutoff proposal snippets;
native 324-excerpt judgments remain the reviewed starting point. Subsequent
bilingual/ablation outputs enter the same pool when available. This is an incremental
development pool, not a complete-corpus recall oracle.

### Controlled ablation and bilingual details

Controlled development uses the existing602 v2 passages, identical stored Qwen
vectors and the exact saved original-query vectors. Expanded variants reuse saved
Luna strings and generated vectors. All views use current source-owned excerpt
presentation so retrieval effects are not confused with a changed snippet rule.
Compare: pinned baseline weighting/threshold/file-dedup adapted to shared inputs;
original BM25+vector protected fusion; expanded protected fusion; complete expanded
reranking; and complete reranking with expansion disabled. Label the adapted
baseline separately from native baseline. Original-only reranking may require one
new complete-candidate Voyage call per question, with no new embeddings/expansion.
Declare a $0.05 ceiling for those at most30 calls, save full observations/failures,
and make no QMD calls or timing repetitions. Unsupported score reuse across
different rerank candidate requests is forbidden. Hash and verify all shared inputs.
Ablation worker owns evaluation-only ablation module/tests and ignored driver;
root owns comparison/pooling. No production behavior changes in this experiment.

The separate bilingual supplement has three authored Polish documents and eight
questions: Polish inflection/paraphrase, English over Polish, Polish over pinned
English sources, literal preservation and an unsupported password question. It is
not a public benchmark or language-parity claim and does not replace the original
80 questions. Review source sufficiency and natural Polish before inference.
Use the current fixed cutoff and stack with a $0.05 ceiling; no QMD or repeat
measurements. Agent-reviewed exact source evidence and failures join development
reports separately. Original held-out inputs remain unopened.

### T06-A3 pooled ablation judgments

The completed five-view experiment adds232 distinct source-owned displayed excerpts
beyond the native324 and proposal187 pool (some of those prior pools overlap).
Review each new excerpt twice with isolated reviewer contexts and shuffled order;
omit view, rank, score and model identity. Record grade0/1/2, facets, explicit
misleading status, minimal exact quote and any sufficient-existing-unit IDs.
Adjudicate all grade/facet/harm/identity disagreements before shared metrics.
Preserve protocol limitations: earlier proposal reviews inherited orchestration
context and retained result order despite omitting scores/model names. They were
independent judgments, not a strictly blinded experiment. The stricter displayed
review finds19/26 useful questions versus the earlier23/26 snippet assessment;
keep both records and use the common displayed protocol for comparisons.

No new inference is needed for this slice. Root owns canonical evidence mapping
and metric integration; two agents own read-only source judgments in run storage.
The implementation remains unchanged until the comparison identifies a concrete
issue. Numeric gates and original held-out access remain downstream.
