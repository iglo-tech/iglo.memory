# Retrieval v2 development results

This is development evidence, not release acceptance. The held-out questions were unopened when these measurements were made; see [the final report](retrieval-v2-heldout.md) for subsequent outcomes. The approved stack is Qwen3-Embedding-8B, prepared BM25, Luna-low typed expansion and Voyage rerank-2.5 through OpenRouter. No product model runs locally.

The full stack improves early ranking and rejects the four unsupported development questions. It returns sufficient displayed evidence within eight results for19/26 answerable questions, versus17/26 for the pinned baseline and9/26 for stock full QMD. The paired95% interval for the baseline useful@8 difference still crosses zero, so these development results do not establish a reliable baseline improvement.

| View                                     | Useful@1 | Useful@8 | Unit-novelty nDCG@8 | Facet recall@8 | Pooled span recall@8 |
| ---------------------------------------- | -------: | -------: | ------------------: | -------------: | -------------------: |
| Native baseline                          |    0.462 |    0.654 |               0.400 |          0.654 |                0.315 |
| Native full QMD                          |    0.192 |    0.346 |               0.177 |          0.327 |                0.149 |
| Baseline scoring on shared Qwen passages |    0.500 |    0.654 |               0.428 |          0.654 |                0.351 |
| Original BM25 + vector fusion            |    0.385 |    0.731 |               0.536 |          0.731 |                0.550 |
| Expanded fusion                          |    0.308 |    0.731 |               0.558 |          0.731 |                0.600 |
| Reranking without expansion              |    0.615 |    0.731 |               0.700 |          0.731 |                0.757 |
| Complete approved stack                  |    0.615 |    0.731 |               0.703 |          0.731 |                0.770 |

All quality columns use the same26 answerable questions and reviewed174-unit source-span pool. Native results use three observations per question; controlled views use one. Native QMD has only29 completed original questions: d30 interrupted, with three later recovery observations recorded separately. This does not affect the26 answerable-question table.

Expansion changes intermediate fusion rankings but leaves29/30 final reranked outputs identical. The remaining output gains one partial passage. It does not improve useful-answer coverage in this development corpus. Reranking improves useful@1 and the fixed cutoff removes all four unsupported outputs; this is in-sample calibration, not a guarantee about unseen questions.

The native baseline returned nonempty evidence on3/4 unsupported questions; QMD did on all3 completed original unsupported questions. QMD recovery for the fourth question stays a separate cohort. The complete proposal returned empty on4/4. No displayed excerpt was judged actively misleading under the recorded rubric. Nonempty irrelevant evidence and misleading evidence are different outcomes.

The bilingual supplement uses three authored Polish documents and eight separately reviewed questions. All eight requests completed; full passages were sufficient for7/7 answerable questions and displayed snippets for6/7. One Polish question over English Fastify documentation lost an explicit-setting condition at the excerpt boundary. The unsupported password question returned empty. This is a small functional supplement, not a public multilingual benchmark or proof of English/Polish parity.

## Measurement and limitations

- Corpus:34 pinned Markdown documents from iglo.mem, uv and Fastify;602 prepared Qwen passages. Fastify is benchmark documentation, not a product framework dependency. Corpus mapping and commit/license provenance are in `corpus.json`.
- Displayed excerpts and complete passages are judged separately. Initial full-passage calibration found useful evidence for26/26 answerable questions, but stricter displayed review found19/26. A relevant retrieved passage can still yield an incomplete400-codepoint excerpt.
- The common scorer uses versioned `unit-novelty-ndcg-v1`: gains0/1/3, only incremental unit gains, maximum gain per result, and shared canonical target units for the ideal. This is not conventional document nDCG. Bundled evidence can score lower than separate ideal units. Span recall is pooled source-span recall, not complete-corpus recall. Original/native metrics remain retained separately.
- Two proposal review passes omitted model names/scores but inherited orchestration context and retained result ordering. They were independent judgments, not strictly blinded. The232 new ablation excerpts had two isolated reviewers and shuffled order; one disagreement was adjudicated. Canonical evidence identity received independent review and four corrections before scoring.
- Original proposal d15 failed expansion; its failure is retained beside the repaired observation used for current quality. QMD had an interrupted d30 attempt with unknown elapsed/output; recovery does not erase it.
- Proposal successful development search latency: median3.25s, p9511.34s, maximum13.77s, measured in-process with one observation per query. Known per-search request cost p95 is about$0.000754. Native measurements include CLI process startup and retained QMD caches; do not pool these timings or call them cold/novel-warm results.
- The controlled comparison reused all embeddings and expansion outputs.29 changed reranking calls cost$0.01432795; one exact request was reused. The bilingual supplement cost$0.00323263. No new QMD development calls or timing repetitions were made.

## Reproduction and evidence

Use the frozen corpus mapping, reviewed source coordinates and explicit observation identities, not current upstream documentation. `scripts/retrieval-eval/proposal.ts` validates source-owned results and replays saved transport. `ablations.ts` constructs shared-input variants. `common.ts` validates canonical judgments and scores all views without inference. Their focused fixtures and `sh scripts/check.sh` cover exact spans, duplicate/partial evidence, failures and immutable contracts.

The complete development report retains per-project/slice counts, query means, fixed-seed paired intervals and win/tie/loss, raw observation hashes and the separate recovery cohort in Cezar task evidence as `common-development-report.json`. The174-unit identity ledger hash is `0f4ce5262e539fcb3c7de38fc5d2aa9b8fd432372fcb6c98779143f499903d07`. Original findings, corrections, source packets and observations remain available there. Final benchmark artifacts and locked release outcomes are in [the replay bundle](retrieval-v2-final/README.md).
