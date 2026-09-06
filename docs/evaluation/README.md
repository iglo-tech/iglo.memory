# Retrieval evaluation

Start with [held-out results](retrieval-v2-heldout.md) and the
[offline replay bundle](retrieval-v2-final/README.md). The original release
decision is `NO_ROLLOUT`; supplemental quality results do not replace it.
[Development comparisons](retrieval-v2-development.md) explain calibration,
expansion ablations and limited bilingual coverage. [Frozen release gates](retrieval-v2-release-gates.md)
record the acceptance values chosen before held-out access.

## Corpus and reproduction

[corpus.json](corpus.json) freezes 34 documents (485,578 original bytes): four
iglo.mem design/usage documents, all 21 Fastify Reference Markdown documents,
and all nine uv project-concept documents. Whole directories provide distractors
without selecting for observed retrieval wins. Fastify Server.md supplies a natural
long document. The collections include tables, fences, API names and error codes.
Path mapping is `.agent/knowledge/<original path>` within separate project roots;
the manifest itself is the reverse map. No complete source corpus or models are committed. The final benchmark bundle
contains only reviewed evidence excerpts.

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

## Labels and immutable observations

The published benchmark has 80 reviewed questions, split 30 development / 50
held-out. Question families stay in one split. Two independent agent reviews and
explicit adjudication replace manual review under the user's instruction.
Grades are 0 for no answer support, 1 for partial support and 2 for directly useful
evidence. Answerability, supported facets and misleading output are separate.
Topical background on an unsupported question does not become positive answer
evidence. Preserve disagreements and corrections rather than changing the
question contract after observing results.

Native captures are hash-bound to corpus, questions, executable/model inputs and
cache regime. Failures and interrupted claims remain recorded; changed inputs
require a new run. A failed request's unknown usage never becomes zero merely
because a retry succeeds. The original eight proposal searches and 42 evaluator
skips remain separate from the supplemental 42 actual searches.

## Common evidence metrics

`common.ts` validates canonical source units, legacy bindings and exact displayed
renderings. Each unit has a question-local ID, minimal source span, target grade,
facets and explicit proposition. Shifted windows expressing the same proposition
at the same locus share a unit; distinct source loci remain separate. Bundled
excerpts can credit multiple units. Identity needs semantic review, not automatic
merging by coordinate overlap.

Renderings retain displayed grade, facets, misleading judgment and exact supporting
quote. Per-unit achieved grades cannot exceed targets. An explicitly reviewed
shorter quote can support a unit without widening its displayed span. Validate
source ownership, Unicode code-point coordinates, frozen hashes and known IDs.
Unknown renderings remain unresolved, not automatically irrelevant.

Useful@1/3/5/8 means at least one grade-2 displayed excerpt, independent of novelty.
Facet recall unions supported facets. Pooled span recall counts each unit once
when achieved grade reaches its target; it is not exhaustive corpus recall.
`unit-novelty-ndcg-v1` uses gains 0/1/3: each rank gains the maximum positive
increase among credited units, then updates all their achieved gains. The ideal
is the first eight sorted unit target gains. Partial then direct support therefore
contributes 1 then 2, while duplicates contribute nothing new. This convention
can penalize bundled evidence relative to separate ideal units; it is not standard
document nDCG. All compared systems share the same reviewed unit pool.

Failed answerable searches score zero with failure retained. Failed unsupported
searches are not successful abstentions. Comparisons average repetitions per
question, use paired question bootstrap intervals and retain missing counts.
The final replay pins the frozen seed, 2000 samples and 95% intervals.

## Maintenance checks

```sh
bun test test/retrieval-publication.test.ts test/retrieval-common.test.ts
bun scripts/retrieval-eval/replay-publication.ts docs/evaluation/retrieval-v2-final /evaluation/corpus
```

The replay requires only local materialized sources. It makes no inference calls.
Run `sh scripts/check.sh` for changed evaluation code. Do not repeat provider or
QMD runs for documentation edits. Frozen native stdout, machine bindings and
run logs stay outside tracked files; published data and hashes support offline
metric reproduction, not independent authentication of omitted provider responses.
