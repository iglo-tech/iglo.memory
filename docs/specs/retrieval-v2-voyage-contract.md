# Retrieval v2 — Voyage rerank contract

## goal

Close T02-R for the [approved stack](retrieval-v2-qwen.md): score every complete
fused passage through OpenRouter, with bounded input and strict local validation.
This is a transport and capacity contract, not evidence that relevance gates pass.

## non_goals

No production integration, generated selection JSON, query rewriting, local model
inference, new credential, QMD execution, exhaustive timing sweep or held-out use.
No inferred probability threshold from reranker scores.

## decisions

### Request and response

Use Bun `fetch` with the existing credential resolver, bearer authentication and
JSON content type. POST `https://openrouter.ai/api/v1/rerank` with precisely:

```json
{
  "model": "voyageai/rerank-2.5",
  "query": "the unchanged original question",
  "documents": ["complete contextual snapshot passage"],
  "top_n": 1
}
```

`documents` contains every fused candidate, in deterministic fused order, and
`top_n` equals its length (1–40). Each string contains the complete passage body
plus bounded path/heading context. T03 freezes that context's serialization;
this contract budgets the final string, never only its body. No chat messages,
reasoning setting, output schema, `top_k`, or undocumented `truncation` argument.
The [official OpenRouter SDK schema](https://github.com/OpenRouterTeam/typescript-sdk/blob/main/src/models/operations/creatererank.ts)
documents `top_n` and does not expose truncation control. The website API-reference
URL returned 404 during this check; the working route and official SDK agree.

Require a JSON object with `model` equal to the requested default or its observed
upstream alias `rerank-2.5`, and `results` with exactly one entry for every input.
Each entry must have a unique safe-integer `index` in `[0, documents.length)`, a
finite numeric `relevance_score`, and `document.text` equal to that indexed input.
Reject missing, duplicate, fractional, fabricated or out-of-range indices; missing
entries; altered echoes; non-finite scores; error envelopes; and malformed JSON.
An empty results array for nonempty input is invalid transport output. Optional
extra fields do not become source evidence. Output passages always come from the
local snapshot, even after echo validation.

Sort validated scores descending; tie-break by original fused position. Do not
require the provider's tie order to be stable or treat its array position as the
source index. Production parsing narrows `unknown` with runtime checks; the
ignored prototype’s permissive TypeScript casts are not production code. The observed response used upstream model name `rerank-2.5` and
provider `VoyageAI by MongoDB`. Unknown custom routes require their own compatible
contract and otherwise fail explicitly; changing the reranker does not re-embed.

If `usage` is present, validate its known fields. `total_tokens` and `search_units`
are nonnegative safe integers; `cost` is finite and nonnegative. Preserve absent
fields as unknown, never zero. Reranking has no generated completion/reasoning
usage. OpenRouter's model catalog currently lists zero prompt/completion prices
for this route; actual usage is billed, so those zeros are not a cost estimate.

### Offline budgeting and source fidelity

Use `@huggingface/tokenizers` 0.1.3 (Apache-2.0, pure JavaScript) with a versioned
Voyage counting profile derived from the licensed, pinned Qwen tokenizer asset.
The Qwen asset comes from revision `1d8ad4ca9b3dd8059ad90a75d4983776a23d44af`.
Retain its NFC normalizer, byte-level pre-tokenizer, vocabulary, merges and added
tokens; replace its EOS post-processor with ByteLevel (`add_prefix_space`,
`trim_offsets`, `use_regex` all false). No chat template is applied.

Against Voyage's public tokenizer revision
`5cf631991ecd82024c3dc64d8e34de27318d5b9e`, vocabularies and all 151,387 merge pairs
are identical (the JSON representations differ: arrays versus joined strings).
The normalizer, pre-tokenizer and added tokens are identical. The derived profile
matched token IDs for 110 Unicode, Polish, identifier, special-token and whitespace
fixtures. This reuses Qwen's licensed data rather than redistributing a second
Voyage asset with no explicit license metadata. Preserve the Qwen license/notice
when bundling. The experimental executable includes the asset and runs offline
from an empty working directory; no runtime download is needed.

The [Voyage tokenization documentation](https://docs.voyageai.com/docs/tokenization)
identifies model-specific public tokenizers. Counts here are exact for the pinned
local profile, **not asserted identical to hosted billing**. The capacity probe
counted 245,760 locally; OpenRouter reported 245,600. This discrepancy remains
recorded. Never decode tokens back into source passages: NFC may change text.
Split original normalized source at source offsets and recount the final inputs.

Freeze conservative application caps:

- Original question: at most 2,048 local Voyage tokens and 16,384 serialized JSON
  string bytes; excess returns `QUERY_TOO_LARGE` before reranking.
- Complete contextual passage: at most 4,096 local Voyage tokens and 32,768
  serialized JSON string bytes. Prepare must split bodies losslessly and bound
  context to satisfy this cap; search never clips or drops protected candidates.
- At most 40 passages, a 2 MiB serialized request and a 2 MiB response body limit.
  Bound response streaming before JSON parsing; do not trust Content-Length alone.
- The full token envelope is `N * queryTokens + sum(documentTokens)`, at most
  245,760. Per-pair input is at most 6,144. These are application caps with large
  headroom, not claimed maximum provider capacities or desired chunk sizes.

The query cap deliberately tightens earlier model-specific query allowances to
the exact complete envelope exercised here. It is not a claim that Voyage cannot
accept longer questions. The [provider's limits](https://docs.voyageai.com/docs/reranker)
are 8,000 query tokens, 32,000 per query/document pair, 600,000 aggregate tokens
and 1,000 documents. Upstream truncation defaults on; OpenRouter provides no
supported switch. Local caps and tokenizer checks therefore prevent reaching
those boundaries. Do not silently inherit these caps for arbitrary custom models.

### Failure, timing and no-answer behavior

Preserve D07: 30-second total search deadline; each request attempt is bounded by
10 seconds and remaining search time. At most two attempts for network failure,
timeout, 429 or 5xx; bounded Retry-After/backoff shares the same deadline. Auth,
credit, malformed response and unsupported-route errors are not retried. A size
failure does not cause clipping, a smaller candidate list or lexical-only fallback.
Emit safe `RERANK_FAILED` reason enums, with `QUERY_TOO_LARGE` for a locally oversized
original question and `SEARCH_TIMEOUT` taking precedence at the total deadline.
Never include provider bodies, queries, documents or credentials in diagnostics.

Transport success returns scores for all candidates, including irrelevant ones.
T05 must implement a separate relevance-selection policy. T06 freezes that policy
on development evidence before held-out access. A valid empty public result comes
from that policy, not from accepting missing reranker results or always taking eight.

## acceptance_criteria

1. Complete 40-candidate input at the declared token envelope succeeds, returns all
   indices and full echoes, and records actual usage separately from local counts.
2. The derived tokenizer agrees with the pinned Voyage profile on focused source
   fixtures, and an isolated executable counts without network or external assets.
3. Local fixtures reject malformed/missing/duplicate/out-of-range indices, altered
   evidence, invalid scores/usage and oversized input before product integration.
4. Production integration preserves D07, bounded response reading and snapshot-only
   source ownership. No no-answer or release-quality claim is inferred from T02-R.

## evidence

Two targeted synthetic requests, no retries and no QMD, under a frozen $0.25 ceiling.
The preflight estimate was $0.013288 using the earlier observed route unit price.

- Full 40 candidates: each document exactly 4,096 local tokens, original query
  exactly 2,048, 829,181 request bytes. HTTP 200 in 1,695 ms, all 40 unique indices,
  finite scores and complete echoes; 245,600 billed tokens, $0.01228. The deliberately
  maximum-sized payload is capacity evidence, not representative p95 or a cost pass.
  A full echoed document proves response fidelity, not independently that every
  token affected model inference; the conservative input limits provide that
  operational protection without claiming access to provider internals.
- Boundary observation: 8,002 locally counted query tokens plus a short document,
  with an unsupported `truncation:false` field, returned HTTP 200 in 1,022 ms;
  8,001 billed tokens, $0.00040005. This does not prove actual truncation, parameter
  forwarding or a provider limit violation. It proves that successful extra-field
  submission cannot establish a no-truncation contract.
- Total observed cost: $0.01268005. No further capacity sweeps are planned.
- Local contract checks: 110 tokenizer fixtures, 14 invalid-response fixtures,
  four request checks passed. Offline compiled counting passed. Product tests,
  timeout/retry integration and relevance calibration remain later-slice obligations.

Raw requests are reproducible from the ignored Bun probes; synthetic response and
summary artifacts are under `.ai/cezar/runs/retrieval-v2/rerank-contract/`. No real
user documents or secrets were used or written into those artifacts.

## next_slice

Root verifies and independently reviews T02-Q/R together, then specifies T03.
Integrate the shared licensed tokenizer asset once. T03 must meet both Qwen's
embedding and Voyage's complete contextual passage caps without losing source text.
T05 owns rerank transport and selection integration after T04 fusion exists.

## tasks

| Task                         | Result / next action                                                       |
| ---------------------------- | -------------------------------------------------------------------------- |
| T02-R transport and capacity | Proposed contract and focused evidence complete; await independent review  |
| T03 passage compatibility    | Bound final context/body under both model profiles; preserve full coverage |
| T05 transport integration    | Implement strict parser, response bound, D07 failure/deadline handling     |
| T05/T06 relevance selection  | Calibrate on development cases, then freeze before held-out access         |

## dependencies

No new provider, credentials, human reviewer or QMD run is required. Production
integration depends on reviewed T02-Q/R, T03 source ownership and T04 fused ordering.

## open_questions

Hosted billing differs from the public tokenizer counts; do not manufacture an
exact match or spend on a broad investigation while the conservative envelope fits.
T05/T06 must determine whether scores separate relevant and unanswerable cases.
The capacity probe's irrelevant scores were approximately 0.56–0.57; this alone
rules out pretending a generic 0.5 cutoff establishes answerability.

Use the existing reviewed development questions plus a small bilingual supplement:
Polish inflection, Polish questions over English passages, exact identifiers,
near-topic but unsupported answers and irrelevant candidates. Review source spans
before measuring scores, record false positive/negative cases, preserve threshold
uncertainty and abstain from declaring no-answer solved without that evidence.

## qa_procedure

Run the ignored `check.ts` with Bun. Build `offline.ts --compile` and execute from
its empty working directory. Reuse the two recorded provider results; do not repeat
live probes for formatting or code review. Product slices add focused controlled
transport errors and a real CLI search over the prepared development snapshot.
