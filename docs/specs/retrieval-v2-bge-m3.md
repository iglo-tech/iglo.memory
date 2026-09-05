# Retrieval v2 — BGE-M3 direction amendment

Status: superseded by the user-approved [Qwen hybrid stack](retrieval-v2-qwen.md).
Retained as decision history; its serving/provider gate is no longer active.

## goal

Use BGE-M3 as the retrieval model, replacing the planned OpenAI-small plus
hand-built BM25 stack. This records the user's September 5 direction change.
It supersedes conflicting model and lexical implementation choices in the parent,
foundation, delivery and token-contract specifications. Preserve the retrieval
outcomes, source safety, migration guarantees and honest quality gates.

## non_goals

No further QMD timing sweeps, cache-regime pilots or repeated foundation runs.
No claim that a model leaderboard establishes quality on this corpus. No silent
substitution of dense-only BGE-M3 for its dense-plus-sparse functionality.

## decisions

- Target BGE-M3 dense plus learned sparse retrieval. Multi-vector interaction is
  optional, pending evidence that its cost is useful. Do not implement the old
  identifier-BM25 engine as a prerequisite.
- R08 and AC05 now require prepared learned sparse weights, exact token-ID matching,
  validated sparse dot products and deterministic ranking. Preserve evaluation of
  identifiers, filenames and error codes; replacing BM25 does not waive those
  user outcomes. D03's hand-written tokenizer, BM25 equation and field weights are
  superseded. D01's lexical storage/profile contracts must be detailed for sparse
  vectors before implementation.
- Keep lossless passages, contextual inputs, snapshot-only search, protected
  original-query candidates, precise evidence and atomic compatible reuse.
  Model changes invalidate vector reuse; never relabel existing OpenAI vectors.
- T02's chat evidence remains applicable to the same chat route. Its cl100k
  embedding counts, 1536 dimensions and 8192/300000 request observations do not
  establish BGE-M3 limits. Verify the chosen route's tokenizer, truncation policy,
  dense normalization, sparse output and batching with a small targeted probe.
- Prefer a hosted route compatible with the existing standalone CLI. OpenRouter
  lists BGE-M3, but its documented embedding representation is dense. A model
  name alone does not prove that the endpoint exposes learned sparse weights.
  Serving dense plus sparse is the next unresolved integration decision. Do not
  silently introduce a daemon, runtime model installation or new credential
  requirement while treating the original deployment contract as unchanged.
- Reuse immutable QMD outputs and judgments. For the remaining held-out comparison,
  obtain only missing question outputs once. Do not repeat them for timing.
  Retry only an actual failed or missing observation, preserving the original.
  No new QMD execution during architecture work. Saved outputs are valid only for
  their pinned corpus, questions and model configuration.
- Prefer focused correctness checks and one representative product smoke per
  meaningful behavior change. Run configured repository checks before review;
  do not repeat expensive live checks without a new failure or changed contract.

## acceptance_criteria

1. Given a selected serving route, one bounded probe verifies actual dense and
   sparse output, ordering, dimensions, finite values and input-limit behavior.
   Dense-only output is reported as a capability gap, not hybrid success.
2. Given a prepared snapshot, original-query dense and sparse retrieval returns
   deterministic source-owned evidence without accessing source files or writing
   state. Preserve coverage, isolation, failed-publication and migration checks.
3. Given unchanged compatible input, preparation reuses its representation;
   changed models or formatting cannot reuse incompatible vectors.
4. Given saved QMD observations, evaluation reuses them without executing QMD.
   Report missing observations and uncertainty rather than manufacturing repeats.
5. Existing frozen labels and held-out custody remain intact. Freeze the revised
   BGE-M3 pipeline and numerical gates before held-out evaluation.

## next_slice

Resolve the dense-plus-sparse serving contract and amend the embedding portion of
T02. Then specify T03's representation, preparation and original-query retrieval
using that verified contract before coding. No additional foundation benchmark.

## tasks

- T01: reviewed at ebe94cf by all three independent review lanes; retain evidence.
- T02: chat contract retained; reopen only the embedding contract for BGE-M3.
- T03: replace BM25 detail with BGE-M3 sparse representation and scoring.
- T04–T05: retain original protection and evidence goals; detail fusion and model
  stages after T03. Do not assume every proposed stage earns its cost.
- T06: compare the frozen revised pipeline using existing QMD development results
  and only missing held-out observations. Keep no-rollout on failed quality gates.
- T07: retain release, standalone and migration verification after T06 passes.

## dependencies

T03 depends on the BGE-M3 serving/token contract. T04–T07 retain their existing
ordering. Historical OpenAI measurements remain baseline evidence, not BGE proof.

## open_questions

Which available hosted route exposes BGE-M3's learned sparse weights while
preserving the existing deployment and credential contract? If none does, record
that specific constraint and resolve the deployment tradeoff explicitly.

## qa_procedure

Inspect one small multilingual/code-identifier batch and its query through the
actual route. Check sparse token IDs and weights, dense vectors, and response
ordering. Use synthetic fixtures for malformed responses, sparse scoring and
migration. Reuse the frozen development corpus for the product smoke; do not
start another QMD run.

## Sources

- [BGE-M3 official model card](https://huggingface.co/BAAI/bge-m3): dense, learned
  sparse and multi-vector outputs; hybrid retrieval recommendation.
- [OpenRouter BGE-M3](https://openrouter.ai/baai/bge-m3): hosted model listing.
- [DeepInfra API](https://deepinfra.com/BAAI/bge-m3/api): documented dense embedding
  response, which alone does not verify sparse availability.
