# Retrieval v2 foundation research

Question: What external constraints affect starting RV2-T01, and which provider assumptions must remain open for T02?

Cutoff: Accessed 2026-09-05 UTC. Local input is main revision `2c456251a029ea78778a195f53a03ad472adc624`. QMD behavior is checked at `dbfd0b4736aeaf761d1a16ca8e424f071df8feb9`; corpus candidates below use immutable commits. Provider observations are a dated advertisement, not a live inference test. Recheck them before T02 spending.

Status: READY for T01 harness and corpus work. This does not pass T01 label/comparator gates or T02/T03 capacity gates.

## Findings

### QMD comparator

High confidence, source inspection: pinned `hybridQuery` probes BM25, conditionally expands, routes lexical/vector variants, fuses, selects chunks, reranks and blends scores. It checks for the vector table before vector retrieval. Therefore a successful `query` invocation alone is insufficient proof that vectors participated. Verify completed document embeddings and record stage execution. Preserve native strong-signal expansion bypasses. [Pinned store implementation](https://github.com/tobi/qmd/blob/dbfd0b4736aeaf761d1a16ca8e424f071df8feb9/src/store.ts#L5438).

High confidence: the CLI emits the strong-signal notice on stderr. JSON output uses `extractSnippet` with a 300 argument and emits file, line and snippet; `--full` instead emits body. It also accepts `--no-rerank`. Capture stdout and stderr separately; use snippet output for presented-evidence scoring, never silently credit full bodies. Map exact evidence into frozen LF-normalized source and adjudicate ambiguity. [Pinned CLI output and hooks](https://github.com/tobi/qmd/blob/dbfd0b4736aeaf761d1a16ca8e424f071df8feb9/src/cli/qmd.ts#L2496).

High confidence: defaults are these local GGUF artifacts; configuration/environment can override them. `XDG_CACHE_HOME` controls the model cache root. Isolate evaluation storage and verify effective defaults. Downloaded bytes still need checksums; URI strings alone do not pin model content. [Pinned model constants and cache resolution](https://github.com/tobi/qmd/blob/dbfd0b4736aeaf761d1a16ca8e424f071df8feb9/src/llm.ts#L280).

- `hf:ggml-org/embeddinggemma-300M-GGUF/embeddinggemma-300M-Q8_0.gguf`
- `hf:ggml-org/Qwen3-Reranker-0.6B-Q8_0-GGUF/qwen3-reranker-0.6b-q8_0.gguf`
- `hf:tobil/qmd-query-expansion-1.7B-gguf/qmd-query-expansion-1.7B-q4_k_m.gguf`

High confidence: this pin declares package version 2.8.3, Node >=22, node-llama-cpp 3.20.0, and a Bun test command. This is not proof that the chosen host can build and run it. Keep the harness in Bun, pin the comparator runtime separately, and record a stock full-mode smoke run before the development sweep. [Pinned package manifest](https://github.com/tobi/qmd/blob/dbfd0b4736aeaf761d1a16ca8e424f071df8feb9/package.json).

### Two corpus candidates

These are recommendations from content inspection, not frozen corpus selections or reviewed labels. They cover different projects and give API/configuration material and workflow/locking material. T01 must select enough surrounding documents for distractors, preserve project isolation, hash every file and license, and create forward/reverse mappings before labeling.

| Candidate | Resolved commit | Inspected evidence |
| --- | --- | --- |
| Fastify v5.6.0 | `70b14e92c0b55e8201f5530ba2e6bab4e928c784` | [Server reference](https://github.com/fastify/fastify/blob/70b14e92c0b55e8201f5530ba2e6bab4e928c784/docs/Reference/Server.md): 69,405 UTF-8 bytes, 2,193 newline-split entries, a natural long document with API identifiers and error references. [License file](https://github.com/fastify/fastify/blob/70b14e92c0b55e8201f5530ba2e6bab4e928c784/LICENSE) identifies MIT. |
| uv 0.8.15 | `8473ecba11664c70628d776c44f60afefee0b49f` | [Locking/sync documentation](https://github.com/astral-sh/uv/blob/8473ecba11664c70628d776c44f60afefee0b49f/docs/concepts/projects/sync.md): 7,403 UTF-8 bytes, 210 newline-split entries, flags and workflow distinctions. [MIT license file](https://github.com/astral-sh/uv/blob/8473ecba11664c70628d776c44f60afefee0b49f/LICENSE-MIT). |

Confidence: high for fetched content, size and tag resolution; medium for benchmark suitability until collection-wide inspection. Pins resolved through GitHub commits APIs for [Fastify](https://api.github.com/repos/fastify/fastify/commits/v5.6.0) and [uv](https://api.github.com/repos/astral-sh/uv/commits/0.8.15). Preserve applicable upstream notices with copied material. No corpus or questions were created here.

### Provider feasibility boundary

High confidence as an advertisement only: direct unauthenticated GET of the [Luna endpoints API](https://openrouter.ai/api/v1/models/openai/gpt-5.6-luna/endpoints) returned HTTP 200 and the requested model ID. The standard OpenAI route advertised reasoning, response format and structured outputs, 1,050,000 context tokens, 922,000 prompt tokens and 128,000 completion tokens. Temperature was absent from its supported-parameter list. Bedrock's listed parameters lacked structured outputs. Generic architecture tokenizer `GPT` does not identify an exact encoding.

Standard OpenAI route prices were $0.20/M prompt and $1.20/M completion tokens, with different flex/fast and long-prompt prices. The spec's 20,000 input plus 2,048 output example is $0.0064576 at those standard rates; this is arithmetic, not billed usage or a search cost measurement. No account, key, low-effort request, production schema or capacity probe was exercised. [Endpoint data](https://openrouter.ai/api/v1/models/openai/gpt-5.6-luna/endpoints).

OpenRouter documents strict JSON-schema output and required-parameter routing for supporting models. Require that routing and validate locally, but do not treat catalog support as proof that these exact schemas succeed. [Structured-output documentation](https://openrouter.ai/docs/guides/features/structured-outputs).

T02 still owns exact tokenizer package/version/license and encoding mappings, compiled asset verification, embedding per-input/aggregate limits, wrapper shortening, unknown-custom-model policy, output/reasoning reserves and the cost-capped live payload matrix. This research does not establish a safe token limit for production. These are required downstream gaps, not reasons to stop offline T01 work.

## Local how/why map

Question: What native baseline behavior must the comparator preserve?

1. `src/cli.ts` parses the command, resolves the worktree/config and emits JSON; failures exit nonzero.
2. `src/chunks.ts` scans only knowledge/decisions Markdown and normalizes CRLF/CR to LF. `chunkMarkdown` groups blocks around a soft 5,000-code-point target. Individual large blocks remain whole; headings and surrounding whitespace are not complete source coverage.
3. `src/prepare.ts` hashes wrapped inputs, reuses valid receipts, embeds pending inputs in batches of 64, then publishes schema 1 through `src/store.ts`. `publish` validates snapshot/vectors before atomic writing.
4. `src/search.ts::search` loads snapshot/vectors under lock, releases it, embeds one query, then calls `rank`. Empty snapshots bypass credentials/network. No Markdown source read occurs on this path.
5. `rank` mixes cosine and lexical bonuses, filters at 0.25, deduplicates by file, returns at most eight, and clips snippets to the first 400 code points. Its line range describes the chunk, not necessarily the snippet.

Data shape: source/nearest heading/inclusive lines/text/input hash plus vector reference/digest; no v2 code-point offset pair or lexical index. These functions were read directly. `git diff 9670f625661e46935ec1523bb70c6dd8b35d48e4 HEAD -- src` is empty. Map status: COMPLETE for the comparator boundary; this is not an exhaustive safety audit.

Intent evidence: Direct — `PRD.md` §§9–10 explicitly assigns source scanning/publication to prepare and snapshot-only search to search. Commit `002cc56d0b6cac9db9724f684cc69e8205c47236` explicitly describes implementation without hard input limits. Conflict: PRD §7 describes overlap/hard splitting that the inspected baseline does not implement. Preserve actual pinned behavior for comparison; do not repair it to match prose. No evidence establishes these scoring constants as empirically optimal. Why status: COMPLETE for this boundary.

## Conflicts, gaps and handoff

- No conflicting external evidence changes the selected model or comparator pin. Route support/pricing differs by endpoint and is not one universal contract.
- The browser could not open the endpoint API; direct Bun fetch succeeded. Initial guessed QMD paths `src/qmd.ts` and `src/formatter.ts` returned 404; the actual CLI path above was read. No claim relies on those missing paths.
- No human reviewer is assigned; no human labels, held-out evaluation, QMD model download/run, host-capacity result or live provider inference exists from this step. Preserve all intake blockers. Optional shared-input QMD adapter evidence remains absent and is not needed to begin T01.
- Next: build T01 manifests and baseline-to-report harness, then stock QMD; keep held-out inputs outside tuning-agent access. Human review and full-QMD evidence remain mandatory for F02/F06. Specify T03 only after reviewed T01/T02 and closed G01/G02. Later task dependencies and release gates remain unchanged.
- Artifact: `.ai/research/retrieval-v2-foundation.md`, from configured `paths.research`. Promote durable implementation decisions/reproduction instructions into `docs/` in their owning slice. This step changes only this findings artifact and the required external rolling handoff.
