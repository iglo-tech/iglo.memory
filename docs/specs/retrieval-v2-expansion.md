# Retrieval v2 — Luna typed query expansion

## goal

Implement required query expansion with `openai/gpt-5.6-luna`, low reasoning, through OpenRouter. User explicitly approved this choice on September6 and accepts observed expansion latency. This supersedes prior local specialist, Astra and no-action recommendations. No new model selection round.

## non_goals

No local inference, new provider, QMD run, generalist-versus-specialist debate, generated source evidence or silent fallback.

## decisions

One typed object {lex:[],vec:[],hyde:[]}, all keys required and no extras. Lex/vec each0–2 strings, HyDE0–1; trimmed well-formed strings1–512codepoints, no controls, containing a letter/number. HyDE<=40words describes a documentation topic without invented answers. Empty arrays are a valid no-op. Dedupe exact strings perchannel and remove original-equal lex/vec after validation. Source outputs never contain generated text.

Version the exact prompt carried by implementation. Start from corrected comparison prompt, add explicit untrusted-user/literal/all-empty rules. Preserve requested fact, negation, actor, scope and ambiguity. Polish queries retain Polish variants plus English bridges; other languages keep original language. Semantic fidelity is evaluated, never claimed proven by syntax validation.

Extract explicit backtick literals, flags, path/filename/underscore tokens, camelCase identifiers and quantities. Require each original anchor as a bounded exact occurrence in every variant; reject invented code anchors. Empty arrays make long-literal questions representable without clipping. Do not infer all ordinary words are identifiers. Original question remains byte-for-byte unchanged for original retrieval and later reranking.

Use chat/completions with Luna, reasoning low, max_tokens1024, provider.require_parameters:true, strict JSON schema; no temperature/tools. Require one assistant choice, stop finish, no refusal/tools, exact observed Luna model identity, bounded JSON content. Local request<=65536serializedbytes and existing original-query admission (Voyage2048tokens/16384serializedbytes plus embedding budget). Stream response<=65536bytes; content<=16384bytes before nested parse. No exact Luna token counting claim. Full-query probe passed before implementation delegation:2048Voyagetokens,18717requestbytes,3.99s,$0.0010208; allendidentifiers preserved,2471reportedprompt/336completiontokens. This proves admission/transport, not semantic retrieval gain.

Run original embedding and expansion concurrently after snapshot validation/admission, one credential resolution, one absolute30sdeadline. Extend shared request helper with caller AbortSignal and EXPANSION_FAILED/expansion enums; max2transient attempts,10sattempt/remaining, bounded retry. On first failure abort siblings, await settlement, preserve causal error; total timeout wins. Empty snapshot bypasses credentials/inference. Prepare retains existing transport behavior.

Lex expansions search prepared BM25 only. Vec expansions use model query formatting; HyDE uses plain generated topic text for embedding only. Budget all actual inputs/batches; never fabricate context/path. Keep original lists weight2, expansions weight1, RRF60. Protect original top8 union; fill40 with existing deterministic soft diversity. No candidate provenance becomes public source evidence. Later T05 uses original question for reranking.

## tasks

T04-E1: publish contract and verify one bounded full-query probe, no QMD.
T04-E2 expansion worker owns src/expansion.ts and test/expansion.test.ts only. Export EXPANSION_MODEL, EXPANSION_PROMPT, expansionRequest(query), parseExpansion(body,query) and expand(query,key,{deadline,signal},request=fetch). Return {lex:string[],vec:string[],hyde:string[]}. Root owns errors/sharedtransport/embedding cancellation, config/search/fusion/CLI integration, taskstate/commits. Use fixed user-approved Luna for this slice; retrieval.model remains the existing configurable reranker, with no silent change to its meaning.
T04-E verification and independent all3review before T05. T05–T07 remain required.

## acceptance_criteria

Exact literal/Unicode/empty/hostile/malformed fixtures; independent original candidates survive expansions; actual query-versus-HyDE formatting; source-deleted CLI search; cancellation settles siblingrequests with no orphanwork or partialresults. Preserve original failures as regression fixtures. Development on/off measures retrieval effects; no claim of improvement from schema smoke alone.

## next_slice

Fullqueryprobe then disjoint expansion worker and root integration, after tasks updated.

## dependencies

Reviewed T04core1bf6c98 and existing Qwen/Voyage/Luna evidence. User's explicit Luna approval resolves modelavailabilityblocker.

## open_questions

Actual retrieval gain and fullpipeline cost remain T06 gates. New prompt/full-query envelope must pass one probe. No user question required.

## qa_procedure

Focused tests, controlled real CLI and configured checks; one declared-budget full-query probe, no repeats/QMD/heldout. Verify then allthree independent reviews on same commit.
