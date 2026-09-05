# Retrieval v2 — T03 preparation and original retrieval

## goal

Ship lossless contextual passages, schema-2 storage and prepared BM25 with original
Qwen vector retrieval through the existing CLI. This is an intermediate branch
slice; full reranking, abstention and release remain T04–T07 obligations.

## non_goals

No new provider, database, local model, search mode, generative expansion or QMD
run. No baseline-score compatibility or final relevance claim for intermediate
ranking. No changes to credential setup, source roots or filesystem safety.

## decisions

T02-Q/R passed independent standard, Gilfoyle and Ponytail review at 9b53082.
Use their exact [Qwen](retrieval-v2-qwen-token-contract.md) and
[Voyage](retrieval-v2-voyage-contract.md) contracts. Bundle the licensed Qwen
asset once; derive Voyage's counting profile without a second vocabulary.

Retain existing module ownership and the public fields used by CLI clients.
The source parser emits a Chunk with source, heading (nearest ancestor), headings,
startLine/endLine (inclusive), text, chunkHash (formatted-input SHA-256), start/end
(code-point offsets, exclusive end) and passageId. Passage ID hashes the canonical
JSON tuple [source,start,end,SHA256(text)], independently of embedding context.

Each SourceDocument stores source, sourceHash, length, lineStarts and ordered
coverage spans. A span has start/end and either passageId or whitespace-only text.
Searchable text exists only in its passage. Empty documents have no spans and
lineStarts [0]. The union of passage references and whitespace spans reconstructs
all LF-normalized source, including headings, separators and suffixes. Validate
reconstructed hash, line starts, contiguity, bounds, unique ownership and no unused
passages without reading current sources. Derive line/column coordinates from the
line-start array. Preserve NFC-distinct source text; never decode token IDs to
construct passages. Malformed Unicode fails explicitly.

Use deterministic section/paragraph boundaries with ATX/setext ancestry and fence/
indented-code awareness. Include heading-only sections. Start with a 500-Qwen-token
soft body target; preserve fitting code blocks, split larger ones losslessly at
newline, whitespace or code-point boundaries. A soft miss may use a larger span
within both hard envelopes. BPE prefix counts are not monotonic; recount chosen
boundaries and never infer impossibility solely from binary search. For unknown
embedding models, a byte target is explicitly a conservative transport budget,
not an exact token count.

Complete document input uses context-json-v2, bounded to 256 embedding tokens
(or the documented conservative custom-model budget), followed by exact text.
Every prepared passage must fit Qwen's 8192-token envelope when Qwen is selected
and Voyage's 4096-token/32768-serialized-byte complete-document envelope. Unknown
models retain one-input requests and the 2048-byte conservative policy. Default
Qwen batches obey 32 inputs and 32768 summed tokens. Existing explicit OpenAI
models retain their known counter/envelope; no silent configuration rewrite.

Schema 2 retains documents as a count and chunks as the searchable list; adds
sources (SourceDocument[]) and lexical (prepared BM25). Profile identity includes
model, dimensions, chunker, normalization, tokenizer, document and query formatting
versions. Receipts explicitly carry schemaVersion 2. Schema-1 search/status/GC
returns INDEX_INCOMPATIBLE without mutation. Prepare rebuilds from source and
never relabels schema-1 receipts. Compatible schema-2 orphan receipts remain useful.

Prepare computes complete coverage and lexical data, resolves compatible receipts,
embeds missing inputs, validates float32 vectors and publishes once atomically.
A moved occurrence in the same contextual section can reuse the same input hash;
a path/heading change alters context and legitimately requires embedding. Failed
prepare preserves the previous generation. A verified provider size rejection may
split a batch or a source span with recomputed identities under the same bounded
operation; other errors never trigger splitting or silent omission.

D03 BM25 operates on body, heading ancestry and source path with weights 1/2/2,
k1=1.2, b=0.75 and positive IDF. Whole identifier tokens plus unique separator and
camel/acronym aliases; Unicode letters/numbers, no stemming or stopword removal.
Persist lengths, term frequencies and document frequencies. Validate prepared
statistics and postings before use; zero-match candidates are omitted. No source
or snapshot-body retokenization is required to execute lexical retrieval.

Original retrieval computes cosine and BM25 independently. Expose a pure original
candidate seam for T04, with deterministic source/offset/ID ties. T03's intermediate
rank may use equal-weight reciprocal rank fusion (constant60) and up to8 passages;
remove the baseline combined0.25 cutoff and hard file deduplication. T04 formalizes
protected40 selection; T05 integrates final relevance filtering and precise excerpts.
Keep intermediate changes on this draft PR, never call them released retrieval v2.

## Interfaces and ownership

Freeze these seams before parallel implementation:

- src/token-budget.ts: budgetFor(model) returns count(text), context(project,source,
  headings), formatQuery(question), fitsDocument(prefix,body), batches(inputs),
  tokenizerVersion and queryFormatVersion. Export voyageTokens(text) for later
  reranking. Counts for unknown models explicitly measure bytes. Invalid/oversize
  requests throw safe AppError, preserving source strings.
- src/chunks.ts: export Chunk, SourceDocument, CHUNKER, sha256, formattedInput
  (project,chunk,model), chunkSource(project,source,text,model) returning
  {document,chunks}; retain chunkMarkdown returning chunks, and scanSources
  (root,project,model) returning {documents,sources,chunks}. Optional model arguments
  default to Qwen. Existing source enumeration/security behavior is unchanged.
- src/lexical.ts: buildLexical(chunks), validateLexical(value,chunks),
  scoreLexical(index,query) returning {passageId,score}[], tokenize(text) returning
  emitted string tokens. LexicalIndex has profile, count and fields body/headings/
  path. Each field has totalLength, lengths keyed by passage ID, and terms keyed
  by token, each {df,postings:[passageId,frequency][]}. Use own-property-safe maps;
  hostile term names must not access object prototypes. Chunk import is type-only.
- Root owns config/errors/store/prepare/search integration, index/ranking tests,
  task state and commits. Passage worker owns token-budget/chunks, tokenizer assets,
  package/lock/formatter asset exclusion and its tests. BM25 worker owns lexical
  module and tests only. Do not edit another worker's owned files without coordination.

## acceptance_criteria

AC01–05/09: standalone imports/assets; exact Unicode/fence/whitespace reconstruction;
rare-term hand-calculated BM25; deterministic independent semantic retrieval;
unchanged/location-only reuse; old/corrupt-generation no-write rejection; failed
publication preserving bytes; source-deleted snapshot search and worktree isolation.
No fake vectors establish semantic quality; controlled vectors prove invariants.

## next_slice

T03-A bundles budgets and builds lossless passages. T03-B builds prepared BM25.
Both may run in parallel against these interfaces, while root integrates storage
and preparation. Verify one integrated snapshot through disposable CLI flows and
configured checks; then run all3 independent review skills before promoting T03.

## tasks

| Slice           | Owner scope                                     | Exit                                                  |
| --------------- | ----------------------------------------------- | ----------------------------------------------------- |
| T03-A           | Token budgets/assets, chunks and focused tests  | Complete source coverage and both model envelopes     |
| T03-B           | Prepared BM25 and focused tests                 | Hand-scored fixtures and corrupt-stat rejection       |
| T03 integration | Config/store/prepare/search and migration tests | AC01–05/09 verified and all3reviews pass              |
| T04–T07         | Existing downstream tasks                       | Detail at each dependency frontier; no scope deletion |

## dependencies

Reviewed T01 and T02-Q/R close G01/G02 for the conservative default envelopes.
T03 must ship the experimental capabilities; reviewed docs do not establish product
integration. T04 remains blocked on T03 verification/review.

## open_questions

Soft passage target and lexical weights remain T06 development choices. Actual
4096-dimension local overhead is measured after integration; profile before any
storage architecture change. Custom provider size errors must be recognized from
an explicit safe contract, never guessed from arbitrary error text.

## qa_procedure

Run focused token/source/BM25 fixtures, then configured checks. Exercise real CLI
empty prepare/search/status/GC, populated prepare/search via controlled transport,
repeat prepare, source removal, migration and failed publication with independent
snapshot-byte inspection. Build the standalone executable and prove bundled assets
from an empty directory. Use a small public live preparation/query smoke only after
offline behavior passes; no QMD or held-out access. Later T05 owns full rerank QA.
