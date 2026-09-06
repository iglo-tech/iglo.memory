# Retrieval provider contracts

These are the implemented application envelopes, not provider maximums or a live
model catalog. Change the versioned profile when changing input semantics; do not
reuse incompatible vectors. Runtime guards live in `src/token-budget.ts`,
`src/embedding.ts`, `src/expansion.ts` and `src/rerank.ts`.

## Qwen embeddings and tokenizer

Default: `qwen/qwen3-embedding-8b`, 4096 dimensions, through OpenRouter.
`@huggingface/tokenizers` 0.1.3 uses build-acquired Qwen assets from revision
`1d8ad4ca9b3dd8059ad90a75d4983776a23d44af`. Count the complete string with
`encode(text, {add_special_tokens: true})`: NFC normalization and the EOS
postprocessor affect counts. Literal added-token strings retain their source
spelling; hosted count parity for such literals was not independently established.
Reject malformed Unicode; never decode token IDs to reconstruct passages.

The query format is version `qwen-documentation-query-v1`:

```text
Instruct: Given a question about project documentation, retrieve relevant passages that answer the question
Query: {unchanged original question}
```

Documents use `context-json-v2`: `Context: ` plus the JSON array of project,
source path and headings, two newlines, then the complete body. Context targets
256 embedding tokens using a full-context digest and deterministic Unicode
preview shortening when needed. Recount the assembled input. Documents do not
receive the query instruction.

Limits: 8192 tokens per complete embedding input, 32768 summed input tokens and
32 inputs per Qwen request. Partition ordered batches without cutting strings.
Oversized original questions fail unchanged. Responses must map every input
index to a finite, nonzero vector of the configured dimension; validate float32
conversion too. Missing, duplicate or out-of-range responses fail.

Explicit OpenAI embedding configurations retain their known counting profile.
Unknown models use one-input requests and a conservative 2048-byte policy;
bytes are not claimed to be exact tokens. Existing explicit configs are preserved.

## Voyage reranking

POST OpenRouter `/api/v1/rerank` with `model: voyageai/rerank-2.5`, the unchanged
`query`, complete `documents` and `top_n` equal to document count (1–40).
Require all unique input indices, finite scores, exact echoed document text and
the requested model or observed alias `rerank-2.5`. Order by score descending,
then input index. Evidence always comes from the local snapshot. Missing results
are errors, not a valid empty selection. Unsupported custom routes fail explicitly.

The Voyage counter reuses the licensed Qwen vocabulary with a ByteLevel
postprocessor (`add_prefix_space`, `trim_offsets`, `use_regex` all false).
It matched the pinned Voyage tokenizer revision
`5cf631991ecd82024c3dc64d8e34de27318d5b9e` on 110 fixtures. Local counts are not
hosted billing: the complete-envelope probe counted 245760 locally and reported
245600 remotely. No second unlicensed vocabulary is bundled.

| Input                                  | Application limit                                         |
| -------------------------------------- | --------------------------------------------------------- |
| Original question                      | 2048 Voyage tokens and 16384 serialized JSON string bytes |
| Complete contextual passage            | 4096 Voyage tokens and 32768 serialized JSON string bytes |
| Candidates                             | 40                                                        |
| Aggregate                              | `N * queryTokens + sum(documentTokens) <= 245760`         |
| Serialized request / streamed response | 2 MiB each                                                |

Local limits keep inputs below observed upstream truncation boundaries; an
unsupported `truncation:false` parameter did not establish a no-truncation
contract. The full 40-candidate envelope succeeded with exact echoes. That is
capacity evidence, not semantic quality or representative latency.

Absent usage remains unknown. Catalog price zeros are not evidence of free
reranking. A transport failure without billing information stays unknown even
when its retry succeeds. Changing rerankers does not require re-embedding.

## Luna expansion

The fixed Luna-low prompt returns exactly `{lex:[],vec:[],hyde:[]}`: at most two
lexical and two vector strings, one HyDE topic, 512 code points per string and
40 words per HyDE. Validate controls, Unicode, identifiers, quantities and exact
protected literals before deduplication. Normalize outer whitespace; empty arrays
are a valid no-op. Preserve the original query for original retrieval and rerank.

Use the versioned prompt/model in `src/expansion.ts`, strict JSON schema,
`max_tokens: 1024`, low reasoning and `provider.require_parameters: true`.
Require one stopped assistant choice, valid model identity and no tools/refusal.
Request and streamed response are limited to 65536 bytes; nested content to
16384 bytes. There is no exact local Luna token-count claim. Original-query
admission also enforces the embedding and Voyage limits.

## Asset provenance

Builds download hash-pinned tokenizer JSON into ignored local assets and compact it with
`JSON.stringify(JSON.parse(upstreamText)) + "\n"`; complete parsed objects are
unchanged. Static imports support standalone offline counting. Keep licenses in
`assets/tokenizers/`; tokenizer data is not inference weights.

Upstream asset SHA-256 values (before whitespace-only compaction):

- `tokenizer.json`: `83cdf8c3a34f68862319cb1810ee7b1e2c0a44e0864ae930194ddb76bb7feb8d`
- `tokenizer_config.json`: `2f58f4bbd7bbce15d683f525954ef3a92cd82f5e06415a9c513859bf8ab72436`
- Qwen `LICENSE`: `832dd9e00a68dd83b3c3fb9f5588dad7dcf337a0db50f7d9483f310cd292e92e`

Bundled compact JSON SHA-256 values:

- `tokenizer.json`: `662967645e3e0c65b1ce2109ed8fa6c758dbd468bcd0661c66fcce212e17a795`
- `tokenizer_config.json`: `7f5d7c2892962c40495871da2b893f899b69a10d0322abc71e59c19cd0c62deb`

References: [pinned Qwen assets](https://huggingface.co/Qwen/Qwen3-Embedding-8B/tree/1d8ad4ca9b3dd8059ad90a75d4983776a23d44af),
[Voyage tokenization](https://docs.voyageai.com/docs/tokenization),
[OpenRouter rerank schema](https://github.com/OpenRouterTeam/typescript-sdk/blob/main/src/models/operations/creatererank.ts).
