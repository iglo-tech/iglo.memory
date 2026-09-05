# Product verification after vector-loader performance fix

Risk: MEDIUM (numeric representation and search latency; no disk format change).
Status: VERIFIED for changed Linux behavior; full delivery remains PARTIAL.
Snapshot: accompanying performance-fix commit, pinned by independent review.

Reproduction: benchmark-cli-3072-initial.json records 5 compiled-CLI runs at
10,000 chunks/3,072 dimensions taking 1,059–1,104 ms, failing the 1-second target.
The loader previously built number arrays and copied/frounded every value;
rank also reduced boxed arrays. It now retains a validated Float32Array view
of aligned little-endian bytes, with explicit LE decoding fallback, and loops
through numeric values without extra array copies. Byte digests, dimension,
finite and nonzero validation remain mandatory. No persistent format, ranking
formula, credential behavior or input acceptance changed.

Scenario: full fixture-driven CLI refresh/search/status/GC after the loader
change, plus stored float32 fidelity and matching-digest zero/NaN/infinity
rejection. Independent snapshot/source checks remain in the CLI harness.

Checks: sh scripts/check.sh PASS (checks-round3.txt; tests and strict types).
sh scripts/build.sh PASS. Trusted source scripts/qa-cli.ts PASS (cli-round3.json).
python3 scripts/qa-clean.py PASS (clean-machine-round3.json). Existing terminal
proof remains current: credential/terminal code is identical to 1b8339e.
benchmark-cli-3072-after.json: 5 compiled production-CLI runs with controlled
fetch response PASS, 542–630 ms, including process startup, local transport
serialization, discovery/config/vector load/validation/ranking/output.
Remote wait is zero in this fixture; this is not live relevance evidence.

Gates: numeric/integrity=PASS; CLI=PASS; module/type=PASS; clean-Linux=PASS;
performance-regression=PASS in focused samples. Extended raw benchmark runs
are recorded separately; no test result is inferred before a run finishes.
GUI/PTY rerun=SKIPPED (no changed terminal flow; retained current PTY evidence).
Live API/other platforms remain NOT_RUN as documented in verify.md.
Cleanup: temporary fixture repositories and containers removed; ignored local
build artifacts remain available. No real keys/API calls or release publication.
Next: all three independent review lanes on the new cumulative revision;
finish retains external release/relevance work and current coverage.
