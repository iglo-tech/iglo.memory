# Development evaluation checkpoint

This is a provisional T01 result, not retrieval-v2 release acceptance. The
[agent amendment](../specs/retrieval-v2-agent-evaluation.md) applies. Both reviews
of the 30 development questions and the isolated 50 held-out questions are complete;
agent identities, corrections and custody hashes are retained. Held-out contents
remain outside tuning inputs until T06.

The native baseline at `9670f625661e46935ec1523bb70c6dd8b35d48e4` completed three
searches for each development question: 90 observations, zero failures. A blinded
164-excerpt partial pool received two source-text reviews and nine explicit
adjudications. Rescoring resolves all baseline observations without changing raw
responses. Direct evidence appears at rank one for 46.2% of the 26 answerable
questions and within ranks three/five/eight for 65.4%. Four unanswerable questions
produced nonempty results on 75% of their 12 successful calls; none of those
excerpts was judged to falsely assert the missing answer.

These estimates use query means, not 90 independent questions. Novel QMD evidence
can extend the pool and change evidence-unit/ideal-ranking denominators; no final
nDCG, parity claim or release decision follows from this checkpoint. The regime is
new processes with retained OS/persistent caches and disclosed prior smoke history,
not proof of model-cold or novel-warm latency. Full QMD and other regimes remain
in progress. Provider costs absent from native output remain unknown.

Inspection found several right-document/wrong-excerpt results: snippets omit the
cleanup command, stale-lockfile error, full profile-change list or dependency
retention rule. They receive partial credit for what is actually shown. This
supports testing contextual passages and precise excerpts in the later product
slices; it does not establish their improvement before implementation.

Reproduce using the [evaluation README](README.md), frozen reviewed labels and
adjudication ledger. Input label hash:
`14199b94f21857cac0ee581ebe3d8785137c156a6346fd237f7477e1b983db70`.
Baseline run identity:
`5e107a79d9fca3829b2dbf9d237eae3def2916a0c0c9f8af3ad701cd11874af5`.
Partial adjudication hash:
`0c44a7bba4ea032efcefaa6878fafc7a559d40f72d840987d70a2cdafa5dda8b`.
Raw corpora, responses and review records remain outside tracked project files.

## Candidate-window and presentation diagnostic

The completed presented pool contains 324 independently reviewed excerpts. Two
older supporting judgments were corrected to irrelevant during cross-surface
adjudication: a generic fastify-plugin recommendation does not explain parent
visibility, and automatic lockfile updating does not explain bypass flags. Original
judgments remain retained; this changes supporting-credit bookkeeping, not the
useful-presence values above. Current ledger identity:
`a680011c1e798cf0f413e41fe01542514591ed67140d000c848cfd87336636f8`.

Full returned candidates were reconstructed without rerunning retrieval. All 408
baseline result references uniquely match complete prepared chunks. All 564 QMD
result references reproduce the saved snippet and line from the pinned selected
reranking window. The 324 unique windows received two independent semantic reviews
and 32 explicit adjudications. Saved rank order is unchanged.

| Surface, 26 answerable development questions | Useful at rank 1 | Useful within 8 |
| --- | ---: | ---: |
| Baseline native excerpt | 12/26 | 17/26 |
| Baseline complete prepared chunk | 21/26 | 26/26 |
| QMD native excerpt | 5/26 | 9/26 |
| QMD selected window before model truncation | 13/26 | 20/26 |

Baseline excerpts use the stock 400-code-point limit; QMD excerpts use its stock
300-UTF-16-unit presentation. QMD may further tokenize and truncate its reranking
input internally: the reconstructed window is explicitly **before that operation**.
It is neither the whole document nor proof of the exact text the reranker consumed.
This diagnostic measures useful evidence among the returned top eight; it does not
measure candidate recall at 40 or establish general retrieval superiority.

Original QMD execution retained 87 completed observations before process loss.
Three missing observations completed under an explicit recovery identity. One
interrupted attempt has unknown output/timing and remains separately recorded.
All 26 answerable questions have three original observations; recovery concerns an
unanswerable question. The original no-answer comparison therefore keeps that
question missing, with recovery reported separately. Do not combine the timing
regimes or call the original run uninterrupted.

The contrast identifies presentation loss as a concrete development problem:
useful evidence can already be present in a selected chunk but absent from the
shown prefix or keyword-centered snippet. T03–T05 must verify that contextual
passages and source-owned excerpts improve what users actually receive.
Diagnostic report identity:
`084cdab08011b5eb85cf460f023af819a956a51a8916c6adc0e14b1ed03fa466`.
Native recovery report identity:
`dac5d939fdd2cadefaccd170ab084a8290b30462a3680665d1cad765cd2effae`.
Independent replay and report audit passed. The [cache-regime diagnostic](cache-regimes.md)
records the completed three-project pilots. This checkpoint does not authorize
rollout or open held-out inputs.
