# Retrieval v2 design boundary

Status: specified in [retrieval-v2](specs/retrieval-v2.md). Proposed v2 boundary; current runtime behavior is unchanged.

## Current seam

`src/chunks.ts:scanSources/chunkMarkdown/formattedInput` owns source discovery,
chunk text/locations and embedding wrappers. `src/prepare.ts:prepare` owns missing
embedding requests and publication. `src/store.ts:profileFor/parseSnapshot/publish`
owns compatibility, integrity and the atomic snapshot; `collect` owns GC.
`src/search.ts:search/rank` loads validated data, releases the lock, embeds a query
and ranks chunks. `src/embedding.ts:embed` owns validated embedding transport.
`src/config.ts:validateConfig` and the credential module own user settings and keys.

Today `chunkHash` serves embedding reuse and chunk identity, while schema 1 has
no lexical profile. That is too little vocabulary for repeated passage occurrences,
source spans, independent lexical changes and query-only model changes.

## Decision

Retain the prepare/store/search boundary. Extend prepared data with passage
occurrences and lexical statistics; add pure retrieval functions and a bounded
chat transport alongside existing embedding transport. Do not introduce a service,
plugin system or database abstraction. Search orchestration owns stage order,
deadline, original-candidate protection and final validated selection.

Prepare owns a generation containing all active occurrence records, exact source
spans, context, lexical postings/statistics and vector references. Store validates
the complete generation before atomic publication and on load. Inline lexical
data in the versioned snapshot is the first option; use separate immutable
referenced artifacts only if measured size/load costs justify them. Either form
has one publication point and no partially visible lexical/vector generation.

Distinguish:

- **Passage occurrence ID:** unique within the prepared generation, tied to its
  source occurrence; repeated text and same-line split spans remain distinguishable.
  No promise that this ID survives re-preparation.
- **Embedding identity:** hash of exact normalized embedding input plus compatible
  model/profile identities. Exclude locations and occurrence IDs. Context changes
  legitimately cause re-embedding; repeated compatible inputs share a vector.
- **Lexical profile:** tokenization, fields and scoring-statistic definitions.
  A lexical-only change rebuilds prepared lexical data without needlessly changing
  otherwise compatible embedding identities.
- **Retrieval revision:** expansion/rerank prompts, model and fusion policy. It
  affects query behavior, not document-vector compatibility by itself.

Do not reinterpret old receipts as compatible merely because a hash matches.
The specification must define supported receipt/profile migration explicitly.
An old snapshot remains byte-preserved after failed preparation, but the new
binary can still reject its old schema; rollback to the old binary or successful
re-preparation is distinct from “old snapshot searchable by v2.”

Model input/output is an untrusted boundary. Transport validates HTTP envelopes,
completion/refusal state and structured output. Retrieval validates identifier
preservation, passage membership, uniqueness and bounds. Presentation resolves
selected IDs solely against the loaded generation. It never accepts generated
source coordinates or quotes. Generation data stays in memory until output, so
later preparation/GC cannot change the evidence of an in-flight search.

## Alternatives

Keep fixed lexical bonuses: simplest, but lacks corpus rarity and length signals;
retain only as baseline. Compute BM25 statistics during every search: possible
without source reads, but repeats derived work and weakens the explicit prepared
index contract; prefer prepare-owned statistics. Add embedded SQLite/ANN now:
could remain standalone, but adds migration/storage work without measured need.
Use a broad retrieval framework: unnecessary configuration and ownership surface.

## Affected contracts and open risks

Specify schema/receipt migration, source offsets for long-line splits, status/GC
validation and publication references; retrieval model configuration; JSON result
score/excerpt semantics and multiple passages per source; remote stage errors and
total deadline. Preserve all current lock and credential safety guarantees.

Open measurement risks are lexical snapshot size/load time at 10,000 passages,
provider-specific token limits, larger rerank payload latency, expansion drift,
list-order bias and relevant passages crowded out by repeated context. Bound and
test them in the full [brief](retrieval-v2-brief.md) evaluation. A disposable
prototype is not required to choose these ownership boundaries; existing provider
probes are feasibility evidence only, not production verification.

Decision: retain prepare/store/search ownership; add prepared passage/lexical data and validated chat inference
Current seam: chunks, prepare, store, search, embedding, configuration and credentials
Alternatives: fixed bonuses; search-time statistics; embedded database/ANN; retrieval framework
Contracts: snapshot/profile/receipt compatibility, passage provenance, search JSON, model configuration, failures
Artifact: docs/retrieval-v2-design.md
Open: token limits, payload performance, lexical index scale, measured relevance
Status: SPECIFIED; downstream measurement gates remain
