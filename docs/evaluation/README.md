# Retrieval v2 evaluation foundation

This is a partial T01/T02 implementation. It does not pass their exit gates or
change production retrieval. Use the [foundation protocol](../specs/retrieval-v2-foundation.md)
for the complete benchmark. Reports deliberately remain `INCOMPLETE`.

## Corpus and reproduction

[corpus.json](corpus.json) freezes 34 documents (485,578 original bytes): four
iglo.mem design/usage documents, all 21 Fastify Reference Markdown documents,
and all nine uv project-concept documents. Whole directories provide distractors
without selecting for observed retrieval wins. Fastify Server.md supplies a natural
long document. The collections include tables, fences, API names and error codes.
Path mapping is `.agent/knowledge/<original path>` within separate project roots;
the manifest itself is the reverse map. No source content or models are committed.

The manifest records immutable upstream commits, original byte hashes and hashes
of UTF-8 text after CRLF/CR normalization to LF. Invalid UTF-8 is rejected. Upstream
license files are retained under `licenses/`. The iglo.mem comparator pin has no
license file; its user-owned material is used locally and must not be redistributed
as an externally licensed corpus. No source acquisition changes this status.

Use Bun 1.4.2 and Git. Clone the three URLs in the manifest into evaluation storage
outside tracked files. Create this config, substituting absolute local paths:

```json
{
  "manifest": "/repo/docs/evaluation/corpus.json",
  "corpusRoot": "/evaluation/corpus",
  "checkouts": {
    "iglo": "/checkout/iglo.memory",
    "fastify": "/checkout/fastify",
    "uv": "/checkout/uv"
  }
}
```

```sh
bun scripts/retrieval-eval/cli.ts materialize /evaluation/materialize.json
```

The destination must not exist. All committed blobs and notices are checked before
writing. Partial destinations are retained for diagnosis; choose a new empty path.
Do not modify the frozen sources for reuse experiments: use another materialization.

## Labels and custody

The `Labels`/`Question`/`Evidence` types in `scripts/retrieval-eval/labels.ts` define
the version-1 JSON. Spans use zero-based LF-normalized Unicode code points, end
exclusive. Grade 2 is direct evidence; grade 1 is supporting; grade 0 is irrelevant.
Evidence units are unique source spans, with facet IDs and reasons. Preserve initial
labels separately from subsequent revisions. Questions carry family, project,
answerability, reason, primary/secondary slices and split.

Development JSON must contain exactly 30 questions with the specified 8/6/4/4/4/4
allocation. `validateLabels(..., 'complete')` additionally validates all 80 and the
50 held-out allocation. Only the evaluator may use that function on held-out inputs.
The CLI always rejects held-out records. It does not generate held-out questions.
Two distinct human review records and an adjudication reference are required to
record reviewed status. Schema checks cannot prove human participation; the evaluator
must inspect that ledger and keep held-out custody until the T06 freeze.

Drafts and reviewer identities belong outside Git. The eventual reviewed benchmark
is published only after held-out evaluation. Add `labels` to the config above and run:

```sh
bun scripts/retrieval-eval/cli.ts validate /evaluation/development.json
```

## Native process observations

Build the unmodified baseline at `9670f625661e46935ec1523bb70c6dd8b35d48e4` using its
`scripts/build.sh`. For each materialized project, initialize a disposable Git repo,
write `.agent/memory.json` with that project ID and the default embedding model,
then run the pinned executable's `prepare` twice. Keep stdout/stderr, timing, exit
codes, binary hash and preparation/reuse summaries outside Git. Live preparation
uses the existing shared credential and consumes API credit.

For stock QMD, checkout `dbfd0b4736aeaf761d1a16ca8e424f071df8feb9`, install its pinned
lockfile dependencies with Bun, and use its stock `bin/qmd`. Record runtime/build
hashes and hardware. Set `XDG_CACHE_HOME` and `XDG_CONFIG_HOME` to evaluation storage.
Run `qmd pull`, record SHA-256 for all three default GGUF files, then for each project:

```sh
qmd --index PROJECT collection add /evaluation/corpus/PROJECT/.agent/knowledge --name PROJECT
qmd --index PROJECT embed
qmd --index PROJECT status
qmd --index PROJECT query 'original question' --json --explain -n 8
```

Never replace `query` with `search`, disable reranking, change models or count an
index without vectors as full QMD. Capture stock traces and disclose bypasses.
Successful exit alone does not certify the comparator. Model-cold/novel-warm/cache
warm evidence still needs the full foundation protocol and evaluator inspection.

Run config extends the development config with `system` (`baseline` or `qmd`),
`commit`, absolute `executable`, its `executableHash`, `preparationEvidence` path,
`output` directory, `repetitions`, `timeoutMs`, `regime: "new-process"` and a nonempty
`cacheFacts` description. For QMD also provide `qmdEnvironment` with the two XDG
absolute paths. Shell model/index overrides and credentials are not inherited by
QMD. Its effective PATH/locale/storage environment is hashed into the run. Baseline snapshot hashes are part of the run identity. QMD model/index/stage
facts must be retained in preparation evidence; this checkpoint does not certify them.

```sh
bun scripts/retrieval-eval/cli.ts run /evaluation/run.json
```

Each run identity hashes exact config, corpus/labels bytes, preparation evidence,
baseline snapshots, evaluator source, runtime and hardware. Each observation is
published exclusively via a completed temporary file. Existing failures resume as
failures. A malformed record stops the run and remains on disk. A crash may leave
an exclusive `.claim`: confirm the original process has stopped, preserve the claim
as evidence, then remove it to resume. Explicit reruns use a new config attempt ID.
No observation is silently overwritten or retried to improve a score.

This checkpoint supports new CLI processes only. It does not mislabel OS/provider
cache state as model-cold or merge it with a warm-process regime. Whole-process
elapsed time is measured; unavailable stages, retries and usage remain null with
reasons. A complete timing benchmark requires at least three repetitions per query
in each specified regime after label and smoke gates pass.

## Scoring and limitations

Returned excerpts are separate from candidate full text. Exact unique substring
matches map to code-point coordinates. The baseline adapter removes only its known
400-code-point clipping ellipsis; QMD removes its known location header and index URL parameter, plus the stock
300-UTF-16-unit clipping suffix when it is absent from the original source.
Repeated text, changed whitespace and unmatched snippets need adjudication. Unknown
or shorter evidence is not guessed irrelevant or useful: query metrics stay null
until adjudicated. All returned novel top-eight evidence needs blinded pooling.

For each ranked result the highest newly covered unit grade supplies the gain
(0/1/3). Units covered by an earlier result cannot gain again. Ideal DCG sorts the
query's judged units; incomplete pooling can change it and must be recorded. Span
recall counts unique positive units, facet recall their union. Useful presence is
reported at 1/3/5/8, with supporting presence separate. Answerable errors contribute
zero usefulness/nDCG; unanswerable errors are failures with null abstention metrics.
Misleading rate needs explicit human judgment, even for exact source text.

`pairedBootstrap` accepts paired query means, uses fixed-seed resampling and returns
95% percentile intervals plus win/tie/loss. The per-system CLI report includes per-project/slice counts, query means,
explicit eligible/scored/missing denominators, unanswerable success/failure and
judgment denominators, and nearest-rank whole-process p50/p95/max. Missing or
unjudged repetitions invalidate a query mean; they are never silently dropped.
The separate observed unanswerable rates use successful calls, with failures and
unjudged harm counts alongside them. At least three complete repetitions are
needed to mark the timing sample representative.

`report.ts::compare` computes paired metrics from query means. Callers must first
check matching corpus/label hashes and cache regimes; differing systems are the
intended comparison, differing inputs are not. The pure summary/comparison functions
have hand-calculated fixtures. A joined artifact CLI and blinded adjudication imports
remain T01 work. Candidate
recall, all cache regimes and preparation-edit experiments also remain incomplete.
No report from this checkpoint can pass F06 or a release gate.

## T02 contract fixtures

`chat-contract.ts` contains the exact D04/D06 prompts, Luna-low parameters, JSON
schemas and local validators. Remote schemas keep array bounds and ID enums local
until the route is probed. Empty arrays succeed; extra properties, lost literals,
unknown/duplicate IDs, refusal, tools and truncation fail. Requests keep complete
candidate bodies and the original question in JSON data. Ordinary title-case words
are not treated as mixed-case identifiers.

The evaluation-only transport checks a total deadline and ten-second attempts,
retries network/429/5xx at most once, respects Retry-After and emits bounded errors.
It is not wired into production. Local fixtures do not prove semantic fidelity,
provider capacity, exact token budgeting, custom-model sizing or bundled tokenizer
assets. G01/G02 stay open until the complete measured protocol establishes them.

```sh
bun test test/retrieval-eval.test.ts test/retrieval-chat.test.ts
sh scripts/check.sh
```
