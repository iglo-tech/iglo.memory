# Retrieval v2 benchmark publication

## goal

Finish RV2-T06 with portable reviewed evidence and an offline reproduction of
its comparison and frozen gate decisions. Preserve original failures and the
separate supplemental diagnostic. This does not authorize RV2-T07 rollout.

## non_goals

No new inference, QMD runs, model changes, scoring changes, or gate relaxation.
Do not publish machine paths, raw vectors, provider reasoning, or run logs.

## decisions

Reuse the existing common evidence scorer, summaries and paired comparisons.
Publish compact JSON data under `docs/evaluation/retrieval-v2-final/`: a manifest,
reviewed 80 labels, final common evidence, normalized observations, concise
adjudication lineage, and expected results. Reuse the existing corpus manifest
and licenses. The manifest pins all bundle files, scorer modules, source hashes,
original freeze identity and unchanged numerical gates. Keep source text outside
tracked files. Raw captures remain in evaluation storage; published hashes bind
those captures but cannot independently authenticate omitted provider responses.

Observations retain question, system, phase, raw hash/run identity, timing,
failure, ranked displayed excerpts and known/unknown cost. Preserve all 192
captures: 50 baseline, 50 QMD, 50 original proposal (8 actual and 42 evaluator
skips), and 42 supplemental actual proposal captures. An actual request may fail.
The original proposal cohort controls release; the diagnostic selects the sole
actual proposal request for each question. A diagnostic cannot replace an
original failed or inconclusive gate.

Four repeated-text coordinate resolutions retain original null mappings, exact
source matches and saved header evidence. Facet corrections retain their prior
judgments and reasons. Neither may change displayed text or rank.

## acceptance_criteria

- Given a relocated bundle and matching materialized corpus, offline replay
  validates hashes, reviewed labels, cohort membership, coordinates and complete
  grading; reproduces the frozen scorer's per-question and aggregate metrics,
  paired intervals and gate decisions; and matches published expected results.
- Missing or altered inputs and invalid cohort membership fail explicitly.
  Unknown costs stay unknown; failed requests are not successful abstentions.
- A reproduced `NO_ROLLOUT` is a successful replay, not a passing release gate.
- Repository checks and all three independent reviews pass. Final publication
  requires independent auditing against all original captures and judgments.

## next_slice

Add `scripts/retrieval-eval/replay-publication.ts` using Bun and existing modules.
Inputs are bundle and materialized corpus paths. Keep the command offline and
confine new runtime logic to validation, cohort assembly and gate reporting.
Compact portable data is exported only after the final semantic review clears.

## tasks

1. RV2-T06-P1: implement offline replay and focused invalid-input checks.
2. RV2-T06-P2: export reviewed final data, audit native-output reconstruction and
   numerical results, exercise relocated replay, then verify and review.
3. Record RV2-T06 findings and RV2-T07's conditional no-action if gates fail.

## dependencies

P1 depends on the existing frozen scorer and publication schema. P2 depends on
P1 and the complete canonical evidence review. RV2-T07 still requires the
original frozen release gates to pass; publication does not waive that edge.

## open_questions

None. Failed gates remain failed; the user authorized agent adjudication.

## qa_procedure

Run replay with the final bundle and corpus, then from another working directory
with relocated inputs. Verify it makes no subprocess, network or inference calls.
Check selected corrupt inputs and run configured lint, formatting, tests and
strict typechecking. Compare the original and diagnostic decisions explicitly.
