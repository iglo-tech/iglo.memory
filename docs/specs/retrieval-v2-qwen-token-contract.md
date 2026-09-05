# Qwen embedding token and transport contract

## goal

Close T02-Q for the [approved stack](retrieval-v2-qwen.md) with a reproducible
bundled tokenizer and a conservative measured request envelope. This replaces
OpenAI-specific token assumptions for the Qwen default. It does not establish
retrieval quality or finish T02-R/T03.

## non_goals

No model weights, runtime asset downloads, new provider account, QMD run,
provider maximum search, dimension reduction or production integration here.

## decisions

Use `@huggingface/tokenizers` **0.1.3** (Apache-2.0), a pure JavaScript tokenizer
with no dependencies. Bundle Qwen's `tokenizer.json` and `tokenizer_config.json`
from revision `1d8ad4ca9b3dd8059ad90a75d4983776a23d44af`. Static JSON imports work
in a standalone Bun executable. Preserve both upstream licenses when integrating.
The assets are about 11.43 MB, not embedding model weights.

Asset SHA-256 values:

- `tokenizer.json`: `83cdf8c3a34f68862319cb1810ee7b1e2c0a44e0864ae930194ddb76bb7feb8d`
- `tokenizer_config.json`: `2f58f4bbd7bbce15d683f525954ef3a92cd82f5e06415a9c513859bf8ab72436`
- Qwen `LICENSE`: `832dd9e00a68dd83b3c3fb9f5588dad7dcf337a0db50f7d9483f310cd292e92e`

Count the complete input with `encode(text, {add_special_tokens: true}).ids.length`.
Qwen's tokenizer normalizes to NFC and appends one `endoftext` token. Omitting the
postprocessor undercounts by one. Recognize literal added-token strings according
to this tokenizer; do not transplant cl100k's special-token policy. The literal
`<|endoftext|>` fixture counts as an added token, but remains untouched in the
submitted string and source snapshot. Backend parity for this literal fixture
was not separately probed; the successful bilingual/count probes did not contain
it. Do not infer source preservation from tokenizer decoding alone. No chat
messages or chat template are applied. The tokenizer config's 131072 maximum is
not the served embedding route's limit: the model card advertises 32768, while
OpenRouter's observed endpoint catalog lists 32000 or 32768 depending on upstream.

Preserve original normalized source strings and code-point offsets independently
of the tokenizer. Do not reconstruct source passages by decoding token IDs:
NFC normalization changes decomposed Unicode. Reject malformed UTF-16 explicitly;
never convert an unpaired surrogate to a replacement character silently.

The exact query format, version `qwen-documentation-query-v1`, is:

```text
Instruct: Given a question about project documentation, retrieve relevant passages that answer the question
Query: {unchanged original question}
```

Use the existing deterministic `context-json-v2` document wrapper, counted with
Qwen instead of cl100k: `Context: ` plus a JSON array of project, source path and
heading chain, two newlines, and the complete source body. Keep the existing
256-token context target, full-context digest and deterministic Unicode preview
shortening policy. Count the entire assembled document again. Documents never
receive the query instruction. Snapshot compatibility must include the model,
dimensions, tokenizer revision, document wrapper and query-format versions;
changing the embedding contract cannot reuse incompatible vectors.

Initial application limits are **8192 tokens per complete input**, **32768 summed
input tokens per request**, and **32 inputs per request**. All counts include
postprocessing. These are conservative product limits verified with focused
requests, not assertions of provider maxima. Greedily partition ordered inputs
before dispatch; never cut a string merely to satisfy a batch limit. Preparation
may produce smaller contiguous source passages before embedding. Oversized
questions fail explicitly unchanged. Empty or malformed individual inputs fail
locally. An empty preparation input list creates no embedding request.

POST `/api/v1/embeddings` with `model: "qwen/qwen3-embedding-8b"`, a string array
`input`, and `encoding_format: "float"`. Omit `dimensions` to retain the model's
full default. Resolve the existing OpenRouter credential only. OpenRouter may route
to different upstreams without requiring an account with them.

Accept exactly one uniquely indexed, nonzero finite 4096-dimensional vector per
input. Reconstruct input order from indices, not response array order. Reject
missing, duplicate, fractional or out-of-range indices, inconsistent dimensions,
zero vectors and malformed/nonfinite numeric elements. Reuse existing `validVector`
so float32 storage conversion must also remain finite and nonzero (finite float64
values may overflow or underflow). Persist the discovered
validated dimension. Model-name normalization in the response is possible: all
three observations returned `Qwen/Qwen3-Embedding-8B`, while requests used the
OpenRouter slug. Do not compare those strings naively and reject valid responses.

No documented OpenRouter truncation switch was found. Local limits prevent known
oversize inputs from being sent; complete requests are never clipped by our code.
The measured provider token usage exactly matched local counts for all three
requests. This supports the tested envelope, not an assertion that arbitrary
future upstreams cannot silently truncate. Record usage/model/provider when
present. Unexpected count discrepancies require investigation and must not be
presented as proof of complete consumption. Provider size errors fail explicitly;
never retry with a shortened question or body. Preserve the previous generation
on preparation failure. Existing deadline, retry and redaction rules still apply.

Unknown custom embedding models retain the earlier explicit conservative byte
policy; this tokenizer and these measured limits are not claimed exact for them.

## acceptance_criteria

- Given the pinned assets, English, Polish, decomposed accents, CJK, emoji, code
  and literal special-token fixtures produce stable counts offline, with EOS
  included. Decoding proves NFC behavior, not source reconstruction.
- Given a complete 8192-token input, it is accepted locally; 8193 fails before
  dispatch. Five 8192-token documents partition into safe batches without loss.
  A 33-input list partitions rather than clipping or dropping an input.
- Given malformed or reordered response fixtures, only unique complete valid
  vectors are accepted and mapped into the original input order.
- The focused live formatted bilingual input, per-input cap and full batch cap
  return valid default vectors. Capacity success is separate from quality.
- A compiled executable runs in an otherwise empty temporary directory without
  Bun on PATH, with fetch disabled and no model/tokenizer files beside it.

## evidence

September 5, 2026: three requests, no retries, reserved $0.041042 against a $0.25
ceiling before dispatch. Actual reported cost was **$0.00041042**. A formatted
Polish question/document batch used 82 tokens through Nebius; one 8192-token input
and a 32-by-1024-token batch used 8192 and 32768 tokens through DeepInfra. Each
returned the required indexed finite 4096-dimensional vectors, with near-unit
norms. Local and reported token counts matched exactly. This is bounded capacity
evidence, not latency statistics, semantic quality or an exhaustive boundary test.

The standalone proof passed with six tokenizer fixtures and no runtime asset
reads. The executable was 94975456 bytes including Bun. Three focused prototype
tests passed, with 16 assertions for local refusal, batching, unchanged query and
response validation. An initial round-trip expectation failed on decomposed text;
the diagnosis was tokenizer NFC normalization, and source reconstruction was
explicitly excluded from tokenizer responsibility.

Reproducible scratch code and observations are under ignored Cezar run storage:
`.ai/cezar/runs/retrieval-v2/qwen-contract/`. `probe.ts` defines the exact synthetic
requests; `budget.json`, the three named response summaries and `offline-proof.json`
retain hashes/counts without credentials. `contract.ts` proposes the reusable pure
interfaces `formatQuery`, `guardInputs`, `batchInputs` and `orderedVectors`.
Production integration must move reviewed code/assets into tracked locations;
ignored prototypes are not a shipped tokenizer implementation.

## next_slice

Review T02-Q and T02-R together, then specify T03 before production edits. T03
integrates the pinned tokenizer, generic counting seam, lossless source slicing,
batching and response guards. Run one preparation flow with the new default;
do not repeat these contract probes unless an observed failure requires it.

## tasks

T02-Q contract/prototype verification is complete pending independent reviews.
T02-R owns rerank capacity. T03 owns shipping/bundling, compatible reuse and CLI
error integration. T06 owns bilingual relevance evaluation and release gates.

## dependencies

The approved Qwen amendment and existing deterministic context/source-range
contract remain authoritative. No further provider setup or owner input is needed.
T03 depends on review of both model-specific contracts.

## open_questions

No unresolved T02-Q blocker for this conservative envelope. Untested upstream
behavior and custom-model capacity remain explicitly unverified. T03/T07 must
verify the integrated executable and dimension-dependent storage overhead.

## qa_procedure

Run `bun test ./.ai/cezar/runs/retrieval-v2/qwen-contract/contract.test.ts` for the
prototype guards. Build `proof.ts` with `bun build --compile`; copy only its
executable into an empty temporary directory and run with no Bun on PATH. Asset
imports are static and the executable disables fetch. Repeat live probes only
for a specific new failure, declaring a budget first. No UI or QMD proof applies
to this transport/tokenizer contract.

## sources

- [Pinned Qwen tokenizer](https://huggingface.co/Qwen/Qwen3-Embedding-8B/tree/1d8ad4ca9b3dd8059ad90a75d4983776a23d44af)
- [Qwen model usage and query instructions](https://huggingface.co/Qwen/Qwen3-Embedding-8B)
- [Hugging Face JavaScript tokenizer](https://github.com/huggingface/tokenizers.js)
- [OpenRouter embedding API](https://openrouter.ai/docs/api/api-reference/embeddings/submit-an-embedding-request)
- [OpenRouter endpoint metadata](https://openrouter.ai/api/v1/models/qwen/qwen3-embedding-8b/endpoints)
