# Retrieval v2 — T05 reranking and precise excerpts

## goal

Complete original-question Voyage reranking and snapshot-owned excerpts (AC07–10).

## non_goals

No changed embedding/chunk profile, local inference, QMD reruns, generated answers, post-rerank per-file cap or held-out tuning.

## decisions

Use exact reviewed retrieval-v2-voyage-contract.md. Transport module rerank.ts builds complete contextual passage inputs from stored context + text, checks all local Voyage/byte/aggregate bounds, requests every fused candidate, validates full index permutation/echo/model/usage. Reuse requestSearchJson with remaining absolute deadline, 2 MiB cap and RERANK_FAILED. Unsupported custom model fails before network; preserve configured model meaning.

Search keeps original question unchanged for rerank. Never combine reranker scores with fusion after selection. Up to eight in reranker order; same file allowed. A relevance cutoff is calibrated on development questions only, with all no-answer cases and false-premise examples. Record graded candidate judgments before examining scores; choose threshold against explicit false-positive/false-negative objective before evaluating heldout. Do not assume 0.5 or probability interpretation. Implementation may accept a private policy parameter for offline evaluation; public default cannot ship before calibration evidence.

Presentation chooses a contiguous <=400 codepoint body window maximizing distinct original-query lexical terms weighted by prepared body IDF. Full contained term occurrences only; earliest start ties. No generated terms. Use snapshot source offsets to compute snippetSpan {start,end,startLine,startColumn,endLine,endColumn}, with codepoint offsets and end-exclusive one-based coordinates from sourcePosition(source, offset). Preserve result startLine/endLine for the full passage. Leading/trailing ellipses outside excerpt. No source file reads.

## tasks

1. T05-A transport and strict parser, owned rerank.ts + tests after T04-E review.
2. T05-B precise excerpt selection, owned presentation.ts + tests after T04-E review.
3. Root development calibration, integration, real CLI QA, configured checks, all three reviews.

## next_slice

T05-A and T05-B may start independently after this detail is published. Root owns selection calibration and search/CLI integration. Preserve all downstream T06/T07 requirements.

## dependencies

T04-E verified/reviewed at 915d610; T02-R complete. T06 remains blocked until calibrated product implementation passes. No user input required.

## acceptance_criteria

Full candidate list reaches reranker, preserved original query; errors/invalid index/altered echo/size/deadline produce no partial result. Relevant suffix body text and multibyte coordinates are exact; irrelevant candidates can produce valid empty selection. Same-file complementary passages survive. Controlled CLI proves source deletion independence and zero calls for empty index.

## open_questions

Actual development score separation and selected threshold remain unresolved. Do not declare no-answer quality or rollout passed from controlled fixtures.

## qa_procedure

Replay saved full-envelope provider result through parser. Controlled CLI exercises reranking and failure/empty paths; configured check once after integration. Focused development provider runs only to calibrate real score selection, declared spend ceiling first. No QMD calls or timing sweeps.

## interfaces

- rerank(query, documents, model, key, {deadline}, request=fetch): validated scores {index,score}[] sorted descending, fused input index breaks ties. payload and parse helpers exported for saved-evidence replay. Default model alias exactly as T02-R; no custom-route inference.
- excerpt(snapshot, chunk, originalQuery): {snippet,snippetSpan}. Reuse tokenize and prepared body document frequencies; sourcePosition already resolves normalized codepoint offsets. Do not modify stored text or add source reads.
- Root assembles documents using formattedInput(snapshot.project identity from config, chunk, embedding model); no new context convention. Policy selects up to8 validated scores above calibrated cutoff in rerank order.
- Token occurrence offsets must represent the complete lexical token or exact alias substring, not a substring inside unrelated words. Distinct query aliases count once each using prepared body IDF; candidate windows can be limited to boundaries where contained occurrence sets change. Deterministic earliest-start tie. All-codepoint fallback first400.

## development calibration

The initial 30-question run used the pinned corpus and complete production
Qwen/Luna/Voyage path. One question failed because of a trailing space in a
faithful generated rewrite. Raw observations remain intact; outer-space
normalization and its regression fix were followed by one targeted corrected
run. No QMD calls or timing repetitions were used. Total observed cost including
602 prepared passages and the corrected run was $0.02224997; the declared ceiling
was $1. These observations are development evidence, not a frozen release run.

Three agents independently read disjoint blinded, shuffled evidence pools, grading
complete passages and displayed snippets separately. They did not see model names,
ranks or relevance scores. The 240 candidate judgments include eight from the
corrected question. Existing reviewed source labels supplied context; previously
unjudged evidence was read, not automatically treated as irrelevant. Qualified
and ambiguous judgments remain recorded in the evaluation run storage.

The method was fixed before score inspection: minimize equally weighted
answerable-question missing-useful-evidence and unanswerable nonempty rates;
then maximize retained useful passages from each question's scored top eight;
then choose the higher cutoff. This selected `0.435546875`, applied inclusively.
Scores are not probabilities. All 26 answerable questions retain at least one
grade-2 full passage; all four unanswerable questions return empty. The average
retained share of useful passages within these top-eight pools is 97.1%, not
corpus-wide recall. The 187 selected passages include 95 grade-2 and 22 grade-0
passages; this policy does not establish high precision merely by avoiding
empty answerable results.

Leave-one-development-question-out selected cutoffs range from `0.361328125` to
`0.443359375`. The held-out development prediction for d27 becomes a false positive when that question is excluded from fitting (one of four unanswerable questions); answerable predictions remain useful. The small unanswerable sample and narrow separation remain risks.
Only 23 of 26 answerable questions retain a grade-2 displayed snippet: d11, d20
and d24 lose decisive evidence through clipping. Preserve this limitation in T06
presentation metrics; do not substitute full-passage scores for snippet quality.
The parent deterministic excerpt rule is implemented as specified. Any subsequent
change must be specified and verified before freezing held-out evaluation.
