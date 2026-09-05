# Build resume

Step 5 build is partial and BLOCKED. No no-action outcome or scope reduction.
Independent T01 argument parsing, redacted errors, physical worktree discovery
and config validation implemented. Full CLI/credential/index code does not exist.
12 module tests/79 assertions and strict types pass. Real Git worktree fixtures
also resolve with no Git on the resolver process PATH. Round 1 reviews: standard
PASS, gilfoyle PASS, ponytail CHANGES_REQUESTED (two minor resolver defects).
Both reproduced and fixed; round 2 review is next before final checkpoint.

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
a90ef01. Current review-fix commit will be recorded in the external handoff/PR.
One draft implementation PR is next; never merge. No design-only PR exists.
Artifacts: plan.md, coverage.md, ../../specs/iglo-mem-next.md,
evidence/T01/{verify,review-round1}.md, evidence/D03/{probe.md,events.json,startup.json}.
Next: wait for user D01/D03 decisions; if protected same-user relocation remains
required, investigate a stronger native/security design before writing keys.
After D03 G01–G05 pass, complete T01 I01–I13 then T02 E01–E07; continue full DAG.
