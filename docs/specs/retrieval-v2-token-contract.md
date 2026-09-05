# Retrieval v2 token-budget slice

Direction update: [BGE-M3 amendment](retrieval-v2-bge-m3.md) supersedes conflicting
embedding/BM25 choices and reduces further QMD execution.

## goal

Make the measured default embedding envelope usable without losing source text.
Provide an offline bundled counter, bounded contextual wrapper and lossless source
ranges for T03. This slice adds reusable evaluation helpers, not a new search path.

## decisions

Use js-tiktoken 1.0.21 (MIT), importing lite plus cl100k_base/o200k_base assets.
Literal tokenizer control strings are ordinary source content. Known embedding
IDs text-embedding-3-small/large use cl100k_base; only the small route's observed
8192-input/300000-aggregate envelope is currently verified live. Count the entire
wrapped embedding input, not a body count plus an approximate wrapper allowance.

Context is `Context: ` followed by a JSON string array of project, path and heading
chain, then two newlines. Default context target is 256 embedding tokens. If full
context exceeds it, include its SHA-256 digest and deterministic shortened previews
in the array; retain the original metadata in the eventual snapshot. Shorten the
longest preview by Unicode code points until it fits, preserving the end of the
source path. Metadata over 4096 UTF-16 units enters preview mode before tokenization
to bound intermediate work; this threshold is not an asserted token count and
does not limit source body size. The digest identifies the full context independently of preview loss.

Lossless splitting returns contiguous normalized code-point ranges and exact text.
Choose a fitting prefix, prefer the last newline, then whitespace, then a Unicode
boundary; recheck the full wrapped input. Never split a surrogate pair or drop
separators. Empty source produces no passages. Invalid Unicode or an unrepresentable
minimum span fails explicitly. Soft 300/500/700 body targets remain experimental;
this helper implements hard wrapped safety, not relevance-driven chunking.

Unknown custom embedding IDs remain configurable. Their future T03 sizing policy
starts with one input per request and a 2048-byte transport target, explicitly not
an asserted token limit. Verified provider size errors may bisect source spans,
rebuild identities and retry preparation; other failures stop and preserve the old
generation. Reaching an unrepresentable single code point stops with provider-limit
guidance. No default tokenizer is silently asserted exact for an unknown model.

## non_goals

No production integration, model substitution or assertion of exact hidden chat
framing. o200k counts serialized Luna payload text according to the official GPT5
prefix mapping; actual provider framing/output envelope is measured separately.

## acceptance_criteria

Unicode, code fences, whitespace, literal special tokens and long lines round-trip
through split ranges exactly. Each emitted complete wrapped input fits its limit.
Huge context shortens deterministically with a stable full-context digest. A wrapper
or minimum source span that cannot fit is rejected, never clipped. Published rank
hashes and isolated executable tests establish bundled-asset provenance.

## next_slice

Build and verify these pure helpers. Complete the live Luna matrix and determine
the safe serialized prompt/output envelope before the T02 exit review.

## tasks

T02 counters/context/range helpers and correctness fixtures; T02 live matrix and
semantic review; T03 integration only after remaining foundation gates pass.

## dependencies

Measured embedding boundaries and tokenizer rank/bundling experiments are complete.
T01 full-QMD comparisons and final T02 capacity selection remain in progress.

## open_questions

Luna capacity results and exact provider framing remain to be reviewed. No human
assignment is required. Unknown-model recovery implementation belongs to T03.

## qa_procedure

Run hand-counted token fixtures and exact reconstruction checks at small limits,
then configured repository checks and isolated compiled-executable proof. Apply
all three independent code reviewers to the same verified snapshot.

## measured chat envelope follow-up

The 120-call development matrix completed with the initial D04/D06 prompts and
schemas: 90 rerank calls across all nine cells and 30 expansions. All responses
reported `openai/gpt-5.6-luna`, provider OpenAI. Every call passed transport/schema
validation on its first attempt. Maximum observed prompt/completion counts were
31832/195, including up to 172 reasoning tokens. Reported cost totaled $0.31559145.
Rerank stage p95 was 3631.4 ms, maximum 5233.8 ms; expansion p95 was 3544.1 ms.
These are stage measurements, not whole-search latency or relevance acceptance.

Source-text review found expansion scope drift, irrelevant no-answer selections
and redundant passages. Preserve those cases for full-pipeline development and
T06 prompt ablations. Successful capacity measurements do not close quality gates.

The next capacity slice fixes a provisional local request cap of 65536 o200k tokens
for the entire serialized JSON request, with a separate 8192-token framing reserve
and 2048-token completion reservation including reasoning. This is an application
budget, not a claimed provider context limit or exact hidden-framing count. Check
it before dispatch; reject oversized requests explicitly and preserve the original
question and complete candidate bodies. Never satisfy the cap by clipping either.
T03 must assemble bounded metadata and fitting passages within this envelope.

Probe near this cap with 40 complete synthetic passages, maximal bounded metadata,
long unchanged questions, Unicode and code. Synthetic fixtures establish capacity
only. Publish exact requests and observed counts before promoting the envelope.
The small reusable budget guard and exact boundary fixtures are the next build
slice; production dispatch integration remains in T03–T05.

Three frozen near-cap requests subsequently succeeded: each contained 65500
serialized tokens, 40 complete synthetic passages, 256-token candidate metadata
and an unchanged 3970-token question. Unicode/code/metadata variants reported
62466/59586/62746 prompt tokens and 116/92/18 completion tokens. All were served
by OpenAI as Luna with low reasoning, valid selections and stop termination.
A 69743-token request was rejected locally without dispatch. The three calls cost
$0.04647025 under a frozen $2 ceiling ($0.206352 reservation). Their observed
latencies were 3.29/5.47/1.22 seconds. Near-cap reranking alone exceeds the initial
$0.01 whole-search goal; capacity is not a cost or latency release pass.

Use the local 65536-token cap for the next integration slice, preserving explicit
provider failures if an untested payload is rejected. The evidence establishes
these tested requests, not every possible token distribution. Budget and raw
observation identity is
`3cb434ebb2f25e5746688615c01b44d5bd528e029b84fdba55aef6d1143437da`;
summary SHA-256 is
`4c00d127618a87dd7ae8cb75aaaa1441d2853b6e6048418dcd6b5fc353f85f3d`.

Exact embedding aggregate probes also accepted 300000 tokens and rejected 300001.
Repartitioning the latter into 294912 and 5089 succeeded with valid 1536-dimensional
vectors. Keep the independent maximum of 64 inputs per batch. Successful calls
reported $0.01200002; rejected-call usage remains unknown. Default-route sizing
uses the verified 8192-per-input and 300000-aggregate limits; custom-route sizing
remains the conservative byte-target/repartition policy above.

## T02 integration decisions

This contract supersedes D02's initial `project-path-ancestry-v2` labeled-line
wrapper with version **`context-json-v2`**: `Context: `, the JSON array described
above, two newlines, and the exact source body. Both full and shortened forms use
that version; shortened arrays begin with the full-context digest. T03 records
this version in passage/snapshot identities. This is a deliberate format decision,
not an assertion that the initial and final formats produce identical embeddings.

Keep embedding and chat metadata budgets separate. Embedding context is at most
256 **cl100k** tokens, as implemented by `boundedContext`. Chat candidates send
`id`, `path`, `headings` and complete `text`. Bound the serialized JSON object
`{path, headings}` to 256 **o200k** tokens before assembling a request. If it does
not fit, replace headings with a full-metadata SHA-256 marker and shortened last
heading, and shorten the path deterministically from its beginning, retaining its
suffix. Repeatedly halve the longest preview by Unicode code points until the
serialized object fits. Hash the original path and complete heading array;
retain them unshortened in the snapshot for provenance and display. The marker
remains when both previews become empty. Count IDs and schema/request framing
again in the complete serialized request; the per-candidate bound does not replace
that final check. Implement this chat-specific serializer during integration.

Keep the original query unchanged. Reject before dispatch if its complete default
embedding input exceeds 8192 cl100k tokens or its complete chat request exceeds
65536 o200k tokens. Unknown custom embedding models follow the explicit provider
size-failure policy rather than an invented tokenizer limit. Never shorten the
question, discard protected candidates or clip passage bodies to fit a request.
T03 chooses passage limits within this contract; a request that still cannot fit
fails explicitly. No separate 4096-token query limit is introduced.

F07–F10 have verified evaluation evidence; these version and metadata/query
clarifications resolve the remaining F11/G02 decisions. G01 is supported by the
measured route/payload probes. T02 exit review still requires independent review
of these final clarifications. T01's full-candidate diagnostic and timing evidence
remain separate prerequisites to T03.
