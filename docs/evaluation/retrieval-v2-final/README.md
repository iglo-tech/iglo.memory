# Offline benchmark replay

See [the held-out report](../retrieval-v2-heldout.md) for findings and limits.
This bundle reproduces a failed original release evaluation and a separate
supplemental diagnostic. Both decisions are `NO_ROLLOUT`. A successful replay
confirms the published calculations, not product release acceptance.

Use Bun 1.4.2. Materialize the pinned corpus using the existing
[corpus instructions](../README.md#corpus-and-reproduction), then run:

```sh
bun scripts/retrieval-eval/replay-publication.ts \
  docs/evaluation/retrieval-v2-final /absolute/path/to/materialized-corpus
```

The command is offline: no provider, QMD, model, checkout or source download is
invoked. It checks bundle, module and source hashes; validates labels, evidence,
coordinates and cohort membership; then reproduces per-question metrics,
summary statistics, paired intervals and frozen gate decisions. Input drift or
results differing from `expected.json` fail explicitly. Use an absolute script
path when invoking from another working directory.

`labels.json` preserves the exact frozen reviewed 80-question file. The other
JSON files are compact to avoid maintaining thousands of formatting-only lines.
All bundle JSON is excluded from formatting because its exact bytes are hashed.
`common.json` contains 223 evidence units and 793 reviewed displayed renderings.
`observations.json` retains 192 rank-preserving captures: 50 baseline, 50 QMD,
50 original proposal (8 actual and 42 evaluator skips), and 42 supplemental actual
proposal captures. The diagnostic uses each question's sole actual proposal
search; it never replaces the authoritative original cohort.

`adjudications.json` retains the four coordinate resolutions and semantic
corrections with previous judgments, reasons and source/decision hashes.
`manifest.json` binds files, scorer modules, corpus, original freeze, gates and
review lineage. The exact historical execution manifest is recoverable at
`5c17ebc2ac58a3357fd063aece16763560a6e8a6:docs/evaluation/retrieval-v2-freeze.json`.
Raw responses, prepared vectors and machine-specific run logs stay in evaluation
storage. Their published hashes bind omitted records; replay cannot independently
authenticate the provider responses themselves.

Useful-result@8 means a grade-2 displayed excerpt occurs within the first eight.
Unit-novelty nDCG and recall use the reviewed pooled source-unit identities;
they are not standard document nDCG or exhaustive corpus recall. Timings and
unknown costs retain the limitations in the report. A failed request is never
counted as a successful empty answer.
