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
