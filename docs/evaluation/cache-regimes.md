# Cache-regime diagnostic

This T01 experiment separates process/model loading, novel-query inference and
repeated expansion/rerank caches. It uses three development questions, one per
project, with three measured calls per regime. It complements the thirty-question
three-repeat development run; it does not establish all-question whole-CLI latency
in every regime or retrieval-v2 release performance.

Stock QMD is pinned to dbfd0b4736aeaf761d1a16ca8e424f071df8feb9. The experiment uses
its default embeddinggemma-300M, qwen3-reranker-0.6b and qmd-query-expansion-1.7B GGUF
models. Runtime is Bun 1.4.2 on an AMD Ryzen 5 1600 CPU. Input manifests retain model,
source, adapter, snapshot and hardware identities. No inference settings or ranking
rules were changed to improve results.

| Question/project | Cold whole CLI, seconds     | Novel warm API, seconds     | Repeated warm API, milliseconds |
| ---------------- | --------------------------- | --------------------------- | ------------------------------- |
| d01/iglo         | 40.807 / 42.946 / 40.842    | 34.326 / 34.023 / 34.311    | 246 / 190 / 186                 |
| d06/uv           | 77.713 / 79.059 / 77.556    | 71.562 / 71.344 / 71.616    | 272 / 288 / 191                 |
| d07/Fastify      | 166.213 / 193.430 / 138.034 | 135.377 / 144.418 / 138.377 | 232 / 238 / 221                 |

Cold measurements launch the unmodified stock CLI on a disposable copy of the
prepared database with an empty expansion/rerank cache. Process-local models begin
unloaded; OS file-cache eviction is not claimed. The original databases and GGUF
files are hash-checked after each project.

Warm measurements use a finite adapter over the exact stock hybridQuery and
withLLMSession functions used by that CLI. Priming is explicit, unmeasured and
retained separately. Novel targets start with warm model objects and an empty
expansion/rerank cache. Repeated targets retain the cache populated by their prime.
State inspection verifies model mappings and cache contents; embeddings still
execute for repeated queries. Stock expansion output differences and bypasses are
retained rather than corrected.

The API clock covers retrieval through stock snippet extraction/JSON serialization.
It excludes process startup, priming, state inspection, artifact writes and shutdown.
Do not subtract it from the whole-CLI number to claim isolated model-load latency,
or pool these boundaries into one percentile. Three repeats expose behavior but
provide little tail certainty. These figures are local observations, not service
latency promises.

The first pilot selected Node because its PATH used the directory containing
bun.exe rather than the directory providing the bun command; it exited139. The
failed attempt and script remain retained. The explicitly linked corrected attempt
verified command resolution and stock QMD version before inference. All subsequent
results retain their own attempt identities. The earlier development-run d30
interruption remains separate and is not repaired by these pilots.

Reproduction packet: qmd-timing-adapter.ts / qmd-timing-project-adapter.ts,
qmd-timing-pilot.ts / qmd-timing-project-pilot.ts and their inspectors, exact input
manifests, copied stock formatting functions and per-call observations. Inspect
stock-format parity, raw snippets, model/cache state, cleanup and original hashes
before accepting a regenerated report. Run one finite process at a time; preserve
failures under distinct attempts. These are evaluator artifacts, not product
runtime dependencies or a daemon.

All 27 measured calls passed, and all 180 displayed excerpts mapped to frozen
sources. Model/cache inspections, original-file integrity and cleanup passed.
This completes the planned three-project diagnostic; it does not promote a
retrieval-v2 release or fill the missing original d30 timing.

Inspection SHA-256 values:

- iglo: `7f1e34521b3e258515fae09216502dc7fc7dbd334762f1f51554a9cf79387fc0`
- uv: `e85c5ae0a099576e21e616df6a46e556a98dafcff2fcd317507c932dfeb1c253`
- Fastify: `8f278af5c3d3002555c5502578a81ed822fcf1fc14246295d58403f9efd7e1cd`

The uv/Fastify extension summary identity is
`12109fc1082646724b92d29f32e562df58ef1bfa3f95af0432a776f04a4d7448`.
These input, script, result and inspection artifacts are retained in evaluator
storage alongside the frozen labels and corpus packet.
