# Held-out collection incident

The original frozen proposal collection executed eight searches successfully.
On h08, the expanded-query embedding request failed at the transport boundary
after about ten seconds. Production retried successfully and returned seven
results. The failed attempt has no response, request ID or billed usage. Its
cost cannot be reconstructed from the successful retry.

The evaluation launcher's conservative unknown-cost guard then recorded the
remaining 42 questions as failed captures without executing them. These are
evaluator skips, not 42 product failures. Original records and frozen release
gates remain unchanged. The zero-unknown-cost gate is not satisfied; this run
cannot authorize rollout or a parity claim.

## Supplemental collection contract

Collect only the 42 demonstrably unexecuted proposal questions in a separate
append-only ledger. Keep the frozen product, manifest, prompts, inputs and
question order. Require the corresponding original record to have empty stdout,
exit code 1 and the exact budget-guard error before admitting a question. Never
repeat any of the eight executed searches. Retain an exclusive system claim on
interruption or publication failure; resume only completed records by identity.

Continue recording unknown costs instead of converting them into zero or aborting
all collection. Admit a next query only while known proposal spending plus a
conservative $0.01 reserve per unknown attempt remains below $0.50; this leaves
reserve under the original $1 budget. This is a local spending estimate, not a
provider-side hard billing guarantee. Preserve unknown billing as unknown.

Report the original frozen evaluation separately from supplemental retrieval
quality. A combined diagnostic view may use each question's sole actual proposal
execution, but must disclose the collection interruption and cannot overwrite the
original gate result. Stock QMD continues its already authorized serial pass with
at most one execution per question; no additional QMD calls or timing sweeps.

Verify that selection contains exactly 42 skips and excludes all eight actual
executions before launch. Independently review the collector and its selection.
No production or frozen evaluation files change, and no tuning follows exposure
to held-out questions. T07 rollout remains a no-action outcome unless an allowed
future evaluation establishes all release gates.
