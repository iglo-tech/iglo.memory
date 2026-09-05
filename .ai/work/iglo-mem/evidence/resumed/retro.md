# Delivery retrospective

Read-only review of this delivery run. Lessons saved as requested; no production/process rewrite or follow-up issue. Delivery remains READY_TO_MERGE for PR #1, not merged; all294 coverage entries are accounted for. This report's COMPLETE does not replace finish.md, PR links, coverage or open items.

1. Observation: the owner's clarification removed elaborate same-user security and contradictory size/overlap constraints, after which all five commands could be delivered. Cause: planning had expanded uncertain intent into hard requirements. Action: resolve the user's actual sharing/input outcome before building machinery for an inferred threat or limit.
2. Observation: real boundaries exposed concrete misses: destination containment, >1s full-CLI latency at3072 dimensions, a concurrent-save zero-link stat race, and a hosted runner's different UID. Cause: initial fixtures did not include those execution contexts. Action: run the actual compiled command and hosted download/clean-machine path early; retain a small concurrency stress case. Keep before/after evidence and reviewer ownership instead of adding another mandatory gate.

Measured cost/evidence: initial3072 CLI samples1059–1104ms failed; validated float32 views reduced final maximum to629ms. Two distinct CI failure causes were repaired (credential stat race, fixture UID assumption). Follow-up runs passed; download artifact was independently executed in clean Debian. Engineering time was not separately measured, so no invented time-savings estimate.

Status: COMPLETE
Next: exercise the real hosted artifact/clean-user boundary earlier in the next delivery. No follow-up issue or repository policy change created.
