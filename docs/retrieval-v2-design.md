# Retrieval design

The implementation uses Qwen3-Embedding-8B, prepared BM25, Luna-low query
expansion and Voyage rerank-2.5 through OpenRouter. No model inference runs in
the executable. See [provider contracts](retrieval-contracts.md) for limits and
[held-out results](evaluation/retrieval-v2-heldout.md) for measured limitations.
The original release gates failed; implementation does not imply release approval.

## Preparation and storage

`src/chunks.ts` owns lossless LF-normalized Markdown coverage, heading ancestry
and source coordinates. Passages plus whitespace spans reconstruct each source;
the snapshot validates hashes, line starts, contiguous coverage and ownership.
Offsets count Unicode code points, with exclusive ends. Preserve NFC-distinct
source strings; token decoding cannot reconstruct source text safely.

Chunking respects headings, paragraphs and code fences, targeting 500 Qwen body
tokens while enforcing complete-input limits. Oversized blocks split at source
boundaries without dropping suffixes. BPE prefix counts are not monotonic, so
chosen boundaries are recounted. Context includes project, path and headings.

Occurrence IDs identify source locations. Embedding hashes identify compatible
formatted inputs, independently of offsets and timestamps. Equal inputs can reuse
vectors while remaining separate evidence occurrences; changed path or heading
context legitimately changes embedding identity.

`src/prepare.ts` resolves compatible receipts, embeds missing inputs and publishes
once. `src/store.ts` owns schema validation, vector loading, atomic publication
and garbage-collection authority. Failed preparation preserves the active
snapshot. A verified provider size rejection may repartition inputs and recompute
identities; unrelated errors never justify omitted source text.

Schema 2 binds model, dimensions, chunker, normalization, tokenizer and formatting
versions. Schema-1 search/status/GC fail with `INDEX_INCOMPATIBLE`; prepare rebuilds
from source rather than relabeling old receipts. Compatible schema-2 orphan
receipts can be reused. GC trusts a validated active generation, not missing files.

## Retrieval and presentation

Search loads and validates the snapshot under its worktree lock, then releases
the lock before inference. It never reads current Markdown. Empty snapshots return
without credentials or network calls. Status reports stored provenance, not
unverified freshness of current source files.

BM25 uses prepared body, heading and path statistics with weights 1/2/2,
`k1=1.2`, `b=0.75` and positive IDF. Tokenization keeps Unicode letters/numbers,
whole identifiers and separator/camel-case aliases, without stemming or stopwords.
This does not establish Polish morphological retrieval quality.

The unchanged original query drives cosine and BM25 retrieval. Luna returns
lexical, vector and optional HyDE topic variants. Lexical variants use BM25;
vector variants use Qwen query formatting; HyDE is embedded as plain topic text.
All generated text remains retrieval input, never source evidence. Empty expansion
arrays are valid. Literal validation rejects lost or invented protected anchors;
it cannot prove semantic fidelity.

Reciprocal-rank fusion uses constant 60, weight 2 for original lists and 1 for
expanded lists. The union of both original top eights is protected. Soft file
diversity fills the remaining positions to 40 without discarding protected hits.
Reranking uses the original question and complete contextual passages. No fusion
score is mixed back into reranker order and no hard per-file cap removes evidence.

Up to eight results pass the inclusive reranker cutoff `0.435546875`. This was
selected on development questions by minimizing equally weighted missing-useful
and unsupported-nonempty rates, then maximizing retained useful passages and
breaking ties toward a higher cutoff. Scores are not probabilities. Leave-one-
question-out thresholds ranged from 0.361328125 to 0.443359375; the small unsupported
sample was fragile. Held-out unsupported results exceed the frozen limit.

`src/presentation.ts` selects contiguous windows of at most 400 code points using
original-query terms and prepared body IDF, with earliest-start ties. Snippet text
and coordinates come from the snapshot; ellipses sit outside the evidence span.
A useful full passage can lose decisive conditions in the displayed window.
Public scores are ordinal ranks, not calibrated relevance probabilities.

## Failures and boundaries

One 30-second search deadline includes lock acquisition and all stages. Attempts
are bounded by ten seconds and remaining time; transient failures get at most one
retry. Failed parallel stages abort siblings and await settlement. Total timeout
takes precedence. Invalid expansion/reranking produces an explicit error, never
partial results or lexical fallback. Logs omit provider bodies, source text and keys.

Keep deterministic chunking, lexical scoring, fusion and presentation separate
from network transport. Inline lexical statistics share the atomic snapshot;
there is no database, daemon or generic retrieval framework. The evaluator remains
outside the executable and preserves immutable captures and failed outcomes.
