# Build resume

Step 5 build is partial and BLOCKED. No no-action outcome or scope reduction.
Independent T01 argument parsing, redacted errors, physical worktree discovery
and config validation implemented. Full CLI/credential/index code does not exist.
12 module tests/79 assertions and strict types pass. Real Git worktree fixtures
also resolve with no Git on the resolver process PATH. Round 1 reviews: standard
PASS, gilfoyle PASS, ponytail CHANGES_REQUESTED (two minor resolver defects).
Both reproduced and fixed; all three round-2 reviews PASS at da10482.
Reports preserve the original disagreement; complete product still BLOCKED.

D03 embedded Node-API experiment had partial successful lock/startup evidence,
but G05 failed when the same OS user moved an opened credential directory into
a real Git worktree. Revalidation-before-write also failed. No prototype wired
into production; all disposable resources removed. No full G gate passed.
Source startup requires --config=<absolute trusted path>, with equals sign.
D01 chunking and D03 threat-model questions were asked; no answer received.
Do not infer consent. T01 credentials/T02 depend on D03; T03 also needs D01/D04.
D02 release matrix and D05 ranking/benchmark remain open. T01–T10 all unfinished.
Keep all 294 PRD coverage units; none has full product proof.

Branch cez/32300cb2 in the existing Cezar worktree. Base 12f3514; initial commit
a90ef01. Reviewed implementation commit: da10482a6b8bc4a108d5ec09097c36a127b840ac.
Draft implementation PR: https://github.com/iglo-tech/iglo.mem/pull/1.
Never merge. No design-only PR exists. Later commit only checkpoints evidence.
Artifacts: plan.md, coverage.md, ../../specs/iglo-mem-next.md,
evidence/T01/{verify,review-round1,review-round2}.md, evidence/D03/{probe.md,events.json,startup.json}.
Next: wait for user D01/D03 decisions; if protected same-user relocation remains
required, investigate a stronger native/security design before writing keys.
After D03 G01–G05 pass, complete T01 I01–I13 then T02 E01–E07; continue full DAG.
