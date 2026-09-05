# Retrieval v2 ownership decision

Status: accepted ownership direction for specification; capacity-dependent T03
contracts remain blocked on T02. This note does not claim implementation.

Decision: retain the current preparation, storage and search boundaries from
[D01–D08](specs/retrieval-v2.md). Keep evaluation outside the executable.

Current seam: `src/chunks.ts::chunkMarkdown` and `scanSources` own source-derived
chunks; `src/prepare.ts::prepare` resolves compatible receipts, embeds missing
inputs and publishes. `src/store.ts::parseSnapshot`, `loadVectors`, `publish` and
`collect` own validation, generation loading, atomic publication and deletion
authority. `src/search.ts::search` loads under the worktree lock, releases it and
calls embedding/ranking; `rank` currently couples retrieval and presentation.

Keep these responsibilities, with the following v2 contracts:

- Chunk construction owns lossless normalized coverage, ancestry and source
  coordinates. Prepare owns provider-driven repartition and recomputation of
  identities before publication. A transport must not silently trim a body.
- Occurrence IDs identify source locations within a generation. Embedding hashes
  identify compatible formatted inputs, excluding coordinates and timestamps.
  Equal inputs may share vectors while remaining distinct evidence occurrences.
- Store owns schema-2 validation, source-span metadata, inline lexical invariants,
  profile/receipt compatibility and one atomic publication point. Search validates
  stored consistency without inspecting current Markdown. GC trusts only a fully
  validated active generation, never current source absence.
- Search orchestrates the total deadline, cancellation, expansion, vector/BM25
  retrieval, protected fusion, reranking and source-owned presentation. Small pure
  lexical/fusion/snippet functions separate deterministic policy from network I/O.
  Bounded chat transport sits alongside embedding transport and shares credential
  resolution. No generic provider or retrieval framework is needed.
- Model request IDs are temporary references to snapshot occurrence IDs. Only
  validated selections enter presentation; text and coordinates always come from
  the loaded snapshot. Lexical/retrieval revisions do not automatically invalidate
  embedding identity. Schema-1 receipts are not reinterpreted as schema 2.
- The Bun evaluator invokes pinned native processes and maps their returned
  excerpts to frozen evidence spans. Its run identity includes all corpus,
  question, build/model and regime inputs. It retains failures and immutable
  observations; changed inputs create a new run. The evaluator owns held-out
  access and blinded adjudication, separate from tuning inputs.

Alternatives: extending `rank` alone is simpler but cannot own prepared lexical
statistics, provenance or asynchronous stage failures coherently. Retaining one
chunk hash as both occurrence and embedding identity breaks location-independent
reuse or duplicate-location evidence. A database/retrieval service adds lifecycle
and deployment obligations outside scope. Inline lexical data is the initial
choice; introduce immutable sidecars only if G05 measurements justify them,
preserving one publication point.

Contracts affected: schema/profile/receipts, prepare migration, status/GC,
responseVersion 2 and ordinal scores, stage errors/deadlines, exact token budgeting,
evaluation manifests/records/judgments. Exact limits, context shortening and unknown
custom-model sizing belong to T02, then the T03 specify pass. No fabricated safe
capacity is established here.

Open: G01/G02 block T03 specification; G05 may change inline storage after profiling.
Status: READY_FOR_SPEC for ownership; dependent capacity contract remains blocked.
