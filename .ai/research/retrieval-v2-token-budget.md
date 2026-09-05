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
