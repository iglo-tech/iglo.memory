# Retrieval v2 — Luna typed query expansion

## goal

Implement required query expansion with `openai/gpt-5.6-luna`, low reasoning, through OpenRouter. User explicitly approved this choice on September 6 and accepts observed expansion latency. This supersedes prior local specialist, Astra and no-action recommendations. No new model selection round.

## non_goals

No local inference, new provider, QMD run, generalist-versus-specialist debate, generated source evidence or silent fallback.

## decisions

One typed object {lex:[],vec:[],hyde:[]}, all keys required and no extras. Lex/vec each 0–2 strings, HyDE 0–1; trimmed well-formed strings of 1–512 code points, no controls, containing a letter/number. HyDE is at most 40 words and describes a documentation topic without invented answers. Empty arrays are a valid no-op. Dedupe exact strings per channel and remove original-equal lex/vec after validation. Source outputs never contain generated text.

Version the exact prompt carried by implementation. Start from corrected comparison prompt, add explicit untrusted-user/literal/all-empty rules. Preserve requested fact, negation, actor, scope and ambiguity. Polish queries retain Polish variants plus English bridges; other languages keep original language. Semantic fidelity is evaluated, never claimed proven by syntax validation.

Extract explicit backtick literals, flags, path/filename/underscore tokens, camelCase identifiers and quantities. Require each original anchor as a bounded exact occurrence in every variant; reject invented code anchors. Empty arrays make long-literal questions representable without clipping. Do not infer all ordinary words are identifiers. Original question remains byte-for-byte unchanged for original retrieval and later reranking.

Use chat/completions with Luna, reasoning low, max_tokens1024, provider.require_parameters:true, strict JSON schema; no temperature/tools. Require one assistant choice, stop finish, no refusal/tools, exact observed Luna model identity, bounded JSON content. Local request is at most 65,536 serialized bytes and existing original-query admission (Voyage 2,048 tokens / 16,384 serialized bytes plus embedding budget). Stream response is at most 65,536 bytes; content is at most 16,384 bytes before nested parse. No exact Luna token counting claim. Full-query probe passed before implementation delegation: 2,048 Voyage tokens, 18,717 request bytes, 3.99 seconds, $0.0010208; all final identifiers preserved, 2,471 reported prompt / 336 completion tokens. This proves admission/transport, not semantic retrieval gain.

Run original embedding and expansion concurrently after snapshot validation/admission, one credential resolution, one absolute 30-second deadline. Extend shared request helper with caller AbortSignal and EXPANSION_FAILED/expansion enums; at most two transient attempts, each bounded by 10 seconds and remaining time, bounded retry. On first failure abort siblings, await settlement, preserve causal error; total timeout wins. Empty snapshot bypasses credentials/inference. Prepare retains existing transport behavior.

Lex expansions search prepared BM25 only. Vec expansions use model query formatting; HyDE uses plain generated topic text for embedding only. Budget all actual inputs/batches; never fabricate context/path. Keep original lists weight 2, expansions weight 1, RRF constant 60. Protect original top eight union; fill to 40 with existing deterministic soft diversity. No candidate provenance becomes public source evidence. Later T05 uses original question for reranking.

## tasks

T04-E1: publish contract and verify one bounded full-query probe, no QMD.
T04-E2 expansion worker owns src/expansion.ts and test/expansion.test.ts only. Export EXPANSION_MODEL, EXPANSION_PROMPT, expansionRequest(query), parseExpansion(body,query) and expand(query,key,{deadline,signal},request=fetch). Return {lex:string[],vec:string[],hyde:string[]}. Cancellation worker owns shared transport/embedding cancellation and transport tests. The cancellation worker also owns search integration; the expansion worker owns focused integration tests. Root owns errors, CLI fixtures, task state and commits. Use fixed user-approved Luna for this slice; retrieval.model remains the existing configurable reranker, with no silent change to its meaning.
T04-E verification and independent three reviews before T05. T05–T07 remain required.

## acceptance_criteria

Exact literal/Unicode/empty/hostile/malformed fixtures; independent original candidates survive expansions; actual query-versus-HyDE formatting; source-deleted CLI search; cancellation settles sibling requests with no orphan work or partial results. Preserve original failures as regression fixtures. Development on/off measures retrieval effects; no claim of improvement from schema smoke alone.

## next_slice

Full-query probe then disjoint expansion worker and root integration, after tasks updated.

## dependencies

Reviewed T04 core 1bf6c98 and existing Qwen/Voyage/Luna evidence. User's explicit Luna approval resolves model availability blocker.

## open_questions

Actual retrieval gain and full pipeline cost remain T06 gates. The full-query envelope passed its one probe; no repeat is needed. No user question required.

## qa_procedure

Focused tests, controlled real CLI and configured checks; one declared-budget full-query probe, no repeats, QMD or held-out access. Verify then all three independent reviews on same commit.
