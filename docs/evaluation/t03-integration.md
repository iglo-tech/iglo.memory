# T03 integration checkpoint

This checkpoint implements lossless schema-2 preparation and original-query
Qwen/BM25 retrieval. It is not the final retrieval-v2 pipeline or a release claim:
protected candidate selection, dedicated reranking and abstention remain T04/T05;
comparative quality and release verification remain T06/T07.

## Implemented behavior

Preparation retains normalized source coverage, headings and code-point locations,
including empty and whitespace-only sources. Compatible schema-2 receipts reuse
vectors; moving unchanged contextual text updates occurrence identity without
re-embedding. Schema-1 search/status/GC fail with prepare guidance. Explicit
migration publishes only after validation; failed preparation preserves old bytes.

The default Qwen tokenizer and derived Voyage counting profile share one pinned,
licensed asset. The binary needs no tokenizer download. Prepared BM25 covers body,
heading ancestry and paths; vector candidates are independent of lexical matches.
Intermediate ranking removes the baseline combined-score cutoff and file cap.
Scores are explicitly ordinal, not probabilities. Final snippet selection and
no-answer filtering are not yet integrated.

## Reproduction and evidence limits

Run `sh scripts/check.sh`, `bun scripts/qa-cli.ts` and `sh scripts/build.sh` with
Bun available. The controlled CLI uses the real entry point and a test-only fetch
preload; the production endpoint has no override. It proves default-model request
shape, prepare/reuse, failed-refresh preservation, source-independent search and
GC authority. Schema tests cover source reconstruction, corrupt coordinates,
location-only reuse and migration failure/success.

A bounded live smoke used the standalone binary, two synthetic English/Polish
configuration passages and one Polish query. Both passages were embedded; repeated
prepare reused both. After deleting the source, the query returned configuration
evidence. This establishes one integrated flow, not benchmark quality. Production
CLI usage is not exposed, so observed billing is unknown rather than guessed.
The smoke reserved $0.002 against a $0.01 ceiling and added no QMD runs.

For local scale, `bun scripts/benchmark.ts 4096 1` creates 10,000 synthetic passages
with the Qwen profile and controlled vectors. On the Ryzen 5 1600 host, the initial
complete local search took 1167 ms. One diagnostic run using
`IGLO_BENCH_PROFILE=1` attributed about 516 ms to snapshot validation, 341 ms to
vector loading/validation and 283 ms to ranking. Diagnostic timings omit locking
and full output preparation and are not acceptance measurements.

A conservative ASCII byte bound avoids repeated tokenization of short metadata;
non-ASCII metadata still uses the exact local tokenizer. Computing vector norms
while validating their float32 values avoids a repeated ranking scan. The updated
complete local search took 901 ms, below the one-second local target for that
observation. This is one warm sample, excludes process startup and remote waiting,
and does not establish final pipeline latency or release readiness. T07 must check
the completed pipeline. No database/sidecar architecture change was needed.

Raw observations, failed measurements and run logs stay under Cezar task storage.
All frozen T01 comparator observations and held-out custody remain unchanged.
