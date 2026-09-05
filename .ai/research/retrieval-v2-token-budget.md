# Retrieval v2 token-budget follow-up

Question: Can current official evidence close T02's exact offline token contract?
Accessed: 2026-09-05 UTC. Status: BLOCKED for G02; no production limits selected.

[Official Luna documentation](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
confirms low reasoning and structured outputs, with a 1,050,000 context window.
It does not name an offline tokenizer encoding for this model. The
[OpenRouter endpoint catalog](https://openrouter.ai/api/v1/models/openai/gpt-5.6-luna/endpoints)
was fetched again; its architecture identifies only `GPT`, not an exact encoding.
Routes differ in required-parameter support and price. Those advertisements do
not prove serialized prompt accounting or account-specific boundaries.

[OpenAI embeddings API](https://developers.openai.com/api/reference/resources/embeddings/methods/create)
documents 8,192 tokens per input and 300,000 aggregate tokens. Applying those
unchanged to every OpenRouter route would be an inference, still requiring the
specified boundary probes. Do not reinterpret catalog/context values as a verified
production-safe limit.

[OpenAI token-counting guide](https://developers.openai.com/api/docs/guides/token-counting)
is the follow-up source for server-side counting. A server-side counting service
would not itself satisfy this project's offline, bundled, single-provider contract.
The first guessed guide URL returned 404; the official navigation resolved the URL
above. No claim relies on that missing page.

Two small schema smoke calls using the exact evaluation requests succeeded through
OpenRouter as `openai/gpt-5.6-luna`, provider OpenAI, with explicit low reasoning.
Expansion reported 153 input/92 output tokens (61 reasoning), $0.000141. Reranking
reported 228 input/67 output (47 reasoning), $0.000126. This is observed smoke
usage, not pricing arithmetic or capacity/relevance acceptance. Budget and exact
request/response hashes remain in local run storage under `luna-smoke-*`.

Open: exact offline encoding and package/artifact/license pins; compilation without
external assets; full 8/24/40 × 300/500/700 matrix; wrapper shortening; embedding
boundary/repartition probes and unknown-custom-model sizing. No substitute model,
character-based hard limit or T03 authorization follows from these smoke calls.

## Follow-up evidence: offline ranks and live embedding boundaries

The earlier encoding gap is narrowed by the provider's own
[pinned tiktoken model mapping](https://github.com/openai/tiktoken/blob/4e71bbe0c078468e00fefbf94b39849389f346e5/tiktoken/model.py).
It explicitly assigns text-embedding-3-small/large to cl100k_base and maps the
`gpt-5` prefix to o200k_base. Applying that prefix to Luna is an inference from
OpenAI's resolver, not a separate Luna-specific tokenizer declaration or an exact
count of hidden chat framing. Live serialized-chat accounting remains to be checked.

An isolated Bun experiment pins js-tiktoken 1.0.21 (MIT), using only its lite
implementation and cl100k_base/o200k_base rank modules. All 100256/199998 ranks
match the official published files, respectively SHA-256
`223921b76ee99bde995b7ff738513eef100fb51d18c93597a113bcffe865b2a7`
and `446a9538cb6c348e3516120d7c08b09f57c36495e2acfffe59a5bf8b0cfb1a2d`.
The compiled executable passed round trips for Unicode, combining characters,
fences, literal special-token strings and an 8192-token input from an empty
directory/minimal environment while node_modules was unavailable. Special strings
were encoded as ordinary document content. This proves bundling for the experiment,
not yet a production tokenizer implementation. Raw package integrity and results
are retained in evaluator storage; no runtime dependency was added to the product.

Six cost-capped, no-retry requests through the actual OpenRouter embedding route
used text-embedding-3-small with 1536 dimensions. Per-input 8191 and 8192 tokens
succeeded, 8193 failed with an explicit 8192-token limit. Aggregate 294912 tokens
succeeded, 303104 failed with an explicit 300000-token limit. The Unicode/literal
special-token request reported the same 18 tokens as the local tokenizer. Returned
vectors passed length, finite-value and nonzero checks. Successful responses
reported $0.00622626 total; failed-request usage/cost was absent and remains unknown.
The frozen ceiling was $1 with a conservative per-token reservation; actual
price-based estimate and all responses remain in embedding-boundary-* artifacts.

Next: implement tested lossless token splitting/wrapper accounting, verify exact
aggregate boundary/repartition, unknown custom-model policy and Luna's measured
8/24/40 by 300/500/700 matrix. G02 is still partial; this evidence closes the
observed embedding route boundaries and standalone-asset feasibility, not all T02.
