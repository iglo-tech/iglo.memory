# Retrieval v2 release freeze

The original execution manifest was committed before held-out access at
`5c17ebc2ac58a3357fd063aece16763560a6e8a6`, path
`docs/evaluation/retrieval-v2-freeze.json`, SHA-256
`5a3e358f20b1aebcf4cf2a0abdc96d54273f9e4f21939d193af288eb4115d2cb`.
It contains machine-specific run paths and is retained in evaluation storage and
Git history, rather than maintained in the source tree. Recover the exact bytes
with `git show 5c17ebc:docs/evaluation/retrieval-v2-freeze.json`. A fresh run must
reconstruct its artifacts and create a new manifest; these paths are not portable.
The historical manifest and acceptance values were not rewritten during cleanup.

Production uses Qwen3-Embedding-8B (4096 dimensions), prepared BM25, Luna-low
query expansion and Voyage rerank-2.5 through OpenRouter. The score cutoff is
0.435546875, with at most 40 rerank candidates and eight 400-codepoint excerpts.
The full manifest binds code, configuration, source documents, prepared data,
runtime executables, tokenizer assets, QMD models and immutable index seeds.
QMD source and dependency locks are bound; individual transitive installed
package files are not all independently hashed. Existing QMD caches persist;
only cache rows may change, with indexed content checked before and after calls.

## Frozen acceptance

Run one observation per system per question: 50 total, including 39 answerable
and 11 unsupported. Failures remain failures, not successful abstentions. Missing
or unjudged evidence makes acceptance inconclusive. Use paired question bootstrap
intervals with seed 20260905, 2,000 samples and 95% coverage.

- Against native baseline: useful-result@8 and unit-novelty nDCG@8 must each
  improve by at least 0.05, with both paired interval lower bounds at least zero.
- Against stock full QMD: both measures and both interval lower bounds must be
  at least zero. This is a gate for this corpus, not general benchmark dominance.
- Identifier useful-result@8 must not regress against baseline.
- Unsupported questions: at most one nonempty result and zero misleading
  results, with neither count worse than baseline.
- Proposal process p95 must be at most 15 seconds, known request-cost p95 at
  most $0.002, failures at most one, and unknown request costs zero. Quantiles
  use nearest rank over all 50 original attempts, including failures.

Unit-novelty nDCG is the documented canonical evidence-unit measure, not standard
ranked-document nDCG. Displayed excerpts determine usefulness. Candidate full-text
coverage is a separate diagnostic. Preserve per-project and intent results,
paired differences, intervals, facet recall and span recall.

The development proposal yielded useful excerpts on 19/26 answerable questions,
versus baseline 17/26 and QMD 9/26. Baseline improvement remained uncertain.
Observed development p95 was 11.34 seconds, exceeding the initial 5-second goal.
The user accepted Luna's speed; the frozen limit is 15 seconds including process
startup. Proposal timing uses an observer invoking the production search path;
it is not a compiled-CLI timing comparison. Known development request-cost p95
was $0.000754; the $0.002 limit is below the original $0.01 goal.

## Execution and outcomes

Proposal known request spending is capped at $1. Stock QMD runs at most 50
queries, serially and once each. No development reruns, cache resets or timing
sweeps are part of this evaluation. Retain completed failures and interrupted
claims; never silently repeat a paid or CPU-heavy observation.

Any failed or inconclusive gate prohibits default rollout and parity claims.
T07 release validation depends on a pass. Do not change models, prompts, cutoff,
metrics or gates after seeing held-out evidence. A revised design needs a new
held-out set or an explicitly exploratory report. Agent reviewers perform label
review and adjudication under the user's instruction; no manual approval gate
is introduced.
