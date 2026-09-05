# Retrieval v2 token-budget slice

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
