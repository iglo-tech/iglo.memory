# Reproducing verification

Run from the repository root on Linux x86_64. Build prerequisites and the pinned
Bun version are in the [README](../README.md#build-and-verification).

## Tests and command flows

```sh
sh scripts/check.sh
sh scripts/build.sh
python3 scripts/qa-terminal.py
python3 scripts/qa-clean.py
npx --yes bun@1.4.2 --no-env-file --no-install --config=/dev/null scripts/qa-cli.ts
```

`check.sh` builds the native binding, runs the tests and checks TypeScript.
It also enforces oxlint and oxfmt. For faster feedback while editing:

```sh
bun run lint
bun run format:check
bun run format
```

The last command writes formatting changes. Dependencies are pinned in
`package.json` and `bun.lock`; CI uses the same checks. Typechecking includes
source, tests and TypeScript scripts. Root imports use `@/` through
`tsconfig.json`; lint rejects relative imports, re-exports and literal dynamic
imports. A regression test exercises those failures through the real linter.

The tests cover credentials, parsing, API response validation/failures,
incremental publication, ranking, data integrity and concurrent worktrees.
The terminal harness checks hidden input, cancellation, reset and shared-key
reuse. The controlled CLI harness checks the command sequence and failed-refresh
preservation without paid API calls.

`qa-clean.py` requires Docker and access to pull its pinned Debian image. It runs
the binary without network, language runtimes, Git or a separately mounted addon.
To test a downloaded build, extract its archive and pass the executable's path:

```sh
python3 scripts/qa-clean.py /absolute/path/to/iglo.mem
```

The [CI workflow](../.github/workflows/check.yml) runs tests, builds, terminal and
clean-container checks, then packages the executable with its permissions.
Fixtures use disposable repositories/homes and dummy credentials.

## Search performance

Build a separate benchmark executable with a controlled embedding response.
This fixture is never included in the product build:

```sh
sh scripts/native.sh
npx --yes bun@1.4.2 --no-env-file --no-install --config=/dev/null build --compile --no-compile-autoload-dotenv --no-compile-autoload-bunfig scripts/benchmark-cli.ts --outfile dist/benchmark-cli
IGLO_BENCH_CLI=1 npx --yes bun@1.4.2 --no-env-file --no-install --config=/dev/null scripts/benchmark.ts 1536 100
IGLO_BENCH_CLI=1 npx --yes bun@1.4.2 --no-env-file --no-install --config=/dev/null scripts/benchmark.ts 3072 100
IGLO_BENCH_CLI=1 IGLO_BENCH_COLD=1 npx --yes bun@1.4.2 --no-env-file --no-install --config=/dev/null scripts/benchmark.ts 1536 20
IGLO_BENCH_CLI=1 IGLO_BENCH_COLD=1 npx --yes bun@1.4.2 --no-env-file --no-install --config=/dev/null scripts/benchmark.ts 3072 20
```

Each invocation creates 10,000 chunks, reports hardware/runtime and raw timings,
and removes its fixture. Cold runs require Python3 and request cache eviction
with fsync/POSIX_FADV_DONTNEED; they do not prove physical disk caches are empty.
Timing includes process startup, local request/response serialization,
discovery/configuration, load/validation, ranking and output. Remote latency is
excluded by the controlled response. Omitting `IGLO_BENCH_CLI=1` measures the
in-process path and is not equivalent to end-to-end CLI timing.

During initial Linux verification, 100 warm and 20 eviction-requested samples
per dimension had maxima of 524ms at 1,536 dimensions and 629ms at 3,072. These
are observations from that runner, not guarantees for every machine or model.
Use freshly reported hardware and timings when evaluating a change.

## Live-provider acceptance

Mocked vectors verify contracts, not semantic relevance. When transport/model
behavior changes, use a disposable repository with a few non-sensitive Markdown
documents and a locally configured OpenRouter key. Live calls consume API credit.
Prepare once, repeat unchanged preparation to check zero new document embeddings,
and search with a paraphrase and an exact technical term. Check expected ranking,
then make source Markdown unreadable and confirm snapshot-only search still works.
Check status/GC and preservation of source, snapshot and credentials; remove the
fixture afterward. Do not print the key or submit private project material.

Keep execution logs and review rounds with the PR, CI artifacts or local run.
Commit regression tests and these reproduction instructions. Promote a result
into maintained documentation only when it explains a lasting decision.
