# Retrieval v2 held-out results

The Qwen/BM25/Luna/Voyage stack returned useful displayed evidence for 38 of 39
answerable questions in the supplemental diagnostic, compared with 23 for the
native baseline and 17 for stock full QMD. This is a result on this documentation
corpus, not a general benchmark ranking. The original frozen evaluation did not
pass release gates; no default rollout follows from this report.

| Measure                                 | Baseline | Full QMD | Proposal diagnostic |
| --------------------------------------- | -------: | -------: | ------------------: |
| Useful evidence in first eight excerpts |    23/39 |    17/39 |               38/39 |
| Unit-novelty nDCG@8                     |   0.3823 |   0.2454 |              0.7473 |
| Median observed process time            |   0.55 s |  95.81 s |              5.53 s |
| Observed process p95                    |   0.71 s | 170.09 s |             13.53 s |

The paired useful-result difference was +38.46 percentage points versus baseline
(95% interval +20.51 to +56.41) and +53.85 points versus QMD (+35.90 to +69.23).
Unit-novelty nDCG differences were +0.3650 (+0.2724 to +0.4617) and +0.5019
(+0.4029 to +0.5943). Intervals use 2,000 paired question resamples and the frozen
seed 20260905. Unit-novelty nDCG is the project's pooled evidence-unit metric,
not standard document-ranking nDCG. The complete data retain per-question,
project and intent results, facet recall and pooled source-unit recall.

## Original run and supplemental diagnostic

The original proposal run made eight successful searches. A failed embedding
transport attempt followed by a successful retry left that first attempt's bill
unknown. The evaluator's frozen budget guard then skipped 42 questions. Those
skips remain failed captures in the original report; they are not 42 observed
product failures. The original unknown-cost and completion gates failed.

A separately recorded supplemental protocol collected only those 42 unexecuted
questions, without repeating any actual search. Together with the original eight,
this provides 50 actual proposal observations: 49 successes and one explicit
expansion failure after a generated query omitted the protected `SHA-256` literal.
That sole-actual cohort is the diagnostic in the table. It does not replace the
original evaluation or its failed gates.

Of 11 unsupported questions, the diagnostic returned two nonempty results,
eight successful empty results, and one failure. The two nonempty results exceed
the frozen maximum of one. No misleading result was judged among the ten
successful observations; the failed question remains unknown, not an abstention.
Four transport-attempt bills are unknown. Known spending is $0.0353278, a lower
bound; total spending and request-cost p95 cannot be certified.

## Scope and limitations

The benchmark contains 80 reviewed questions, split into 30 development and 50
held-out questions, over 34 Markdown documents from iglo, uv and Fastify. Fastify
is benchmark documentation, not a product server dependency. Independent agents
reviewed and adjudicated labels and displayed evidence under the user's explicit
instruction. The final held-out evidence contains 793 unique renderings and 223
canonical source units. Four repeated-text mappings were resolved from saved QMD
line headers; an explicit facet-correction ledger preserves prior decisions.

QMD ran once per held-out question, serially: 50 successes. Expansion was not
bypassed on 47 queries; three used its strong-BM25 shortcut. No reranker-unavailable
fallback was observed. Existing caches were retained and cache hits are unknown.
No additional QMD sweep or timing repetition was performed.

Timings are one pass on a shared host. Proposal timing uses an observer around
the production search path, not the compiled CLI; QMD contended for the same host.
They are observed process times, not isolated hardware-normalized speed claims.
This corpus does not establish general multilingual or Polish retrieval quality.

## Delivery outcome

T01–T05 are implemented and verified. T06 records the comparison and the failed
original release decision. T07 remains a conditional no-action because it depends
on passing T06 gates. Its final 4096-scale, clean-machine and release checks were
not performed or waived. A later tuned design requires fresh held-out evidence;
the frozen model, prompts, cutoff and gates were not changed after this run.
