# Independent review round 4 — CI credential fix and downloadable build

Base: 12f3514c91ae138f0c7c4729224c4279065b278f
Head: 3a521ae13f3c7137f30d2674028f3abeea7e25ac
Status: CHANGES_REQUESTED (historical; correction verified at 0b9d877, follow-up pending).
All lanes ran independently after verify-final local product verification with the full original request/PRD and accepted amendments. No optional domain experts/additional review skills configured.

- Standard: CHANGES_REQUESTED, MAJOR scripts/qa-clean.py:19. TemporaryDirectory is private to caller UID but container hardcodes1000; another runner cannot access mounted repo, stopping artifact delivery. Actual run33963961228 passed tests/build/PTY and failed clean QA. Use invoking UID/GID and include stdout JSON errors in diagnostics. Cumulative whitespace/pinned head pass; inspected 35 tests/292 assertions and full live/local/stress proof. No new production finding. Prior round1 BLOCKER containment remains RESOLVED.
- Gilfoyle: PASS, no new findings. Independently ran35 tests/292 assertions; cumulative whitespace/pinned head pass. Checked zero-link atomic replacement versus multiple-hardlink denial, unchanged permissions/containment, float32 backing storage, live/latency/CLI/PTY evidence. Did not identify the harness UID defect. CI/download/coverage remain finish checks; telemetry NOT_RUN (unconfigured), endian fallback inspected not exercised. Prior MAJOR containment remains RESOLVED.
- Ponytail: CHANGES_REQUESTED, same MAJOR harness defect. Reproduced mounted0700 fixture ownedUID1000 inaccessible to containerUID1001 (Permission denied). Credential/index suites13 tests/140 assertions and cumulative whitespace pass. No source/complexity finding; last-save-wins fix fits accepted user contract. Prior MAJOR containment remains RESOLVED.

Identical harness findings deduplicated without replacing lane verdicts. Production findings: none open. Correction: commit0b9d877 uses os.getuid()/getgid(), surfaces stdout+stderr; local and both hosted clean QA pass; downloaded artifact passes clean-container proof. Reviewers made no code changes or paid API calls. Final follow-up reviews required before readiness.
