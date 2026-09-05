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
