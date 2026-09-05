# Retrieval v2 agent evaluation amendment

## goal

Implement retrieval v2 using well-known Markdown project documentation and stock
QMD as the behavioral reference, with agent judgments and automated product QA.
This amendment records the user's 2026-09-05 instruction and overrides conflicting
human-testing, human-review and human-custody requirements in the parent,
foundation and delivery specifications. It does not claim agents are humans.

## decisions

- Keep the frozen iglo.mem, Fastify and uv corpus and pinned native comparators.
  Fastify and uv are documentation fixtures, not product runtime dependencies.
- Agents read source content and judge relevance, answerability, facets and
  misleading excerpts. Record reviewer identity, `kind: "agent"`, reviewed
  revision, reasons and adjudication. Existing human ledgers remain supported.
- Retain two separate review passes and resolve disagreements explicitly. Human
  participation is no longer a gate. Agent-authored judgments remain identified
  as such in published evidence; they do not establish human user preference.
- Retain the 30/50 split and intent-family isolation. Agent evaluator custody is
  permitted. Keep held-out contents outside tuning inputs until the T06 freeze.
- Execute terminal, CLI and clean-machine flows directly. No task is blocked
  solely because its older instructions assigned testing to a human.
- Preserve actual provider, correctness and measurement failures. Existing
  quality gates, lossless source handling, model contracts and no-rollout outcomes
  remain in force. A judgment is evidence, not an automatic passing result.

## non_goals

No framework substitution, QMD fork, human-review claim or fabricated benchmark
result. No release before the remaining implementation and verification pass.

## next_slice

T01 agent review: accept truthful agent provenance in label validation, read and
adjudicate the 30 development labels against source Markdown, then run the native
comparators on that frozen revision. Judge novel pooled evidence separately.

## acceptance_criteria

- Given human or agent review records, validation preserves their declared kind;
  unknown kinds, missing revisions and fewer than two distinct reviewers fail
  reviewed status. Draft status still cannot imply completed review.
- Given reviewed development labels, each positive span has a content-based
  reason and disagreements have a retained resolution artifact.
- Given comparator output, evidence remains tied to source coordinates; agent
  judgments do not silently replace missing observations or failed calls.
- Given held-out questions, the development runner continues rejecting them.

## tasks

T01 continues with agent label review, adjudication and comparator measurements.
T02 continues with measured tokenizer/capacity contracts. T03–T07 retain their
existing dependencies and receive detailed slices before implementation.

## dependencies

Reviewer recruitment is removed from the frontier. Corpus and QMD setup are
complete; review and measurements are execution work. Provider limits remain
unresolved until supported by source and live evidence.

## open_questions

No human assignment or approval is needed for the revised evaluation workflow.
Numerical results and implementation limits remain to be measured.

## qa_procedure

Run label validation fixtures for both reviewer kinds and rejected ledgers. Read
source context during semantic review, preserve disagreements, hash the reviewed
revision, execute native comparisons and retain unknowns and failures. Apply all
three independent code-review skills to each verified implementation snapshot.

## T01 pooled adjudication slice

A version-1 adjudication file binds original corpus/label byte hashes to a reviewed
30-question label revision and explicit excerpt mappings. The revision preserves
question wording, family, answerability, facets, split and all original evidence
units; it may add reviewed evidence units and reasons. This prevents silently
changing the question after observing a system's result. Rejudging existing units
requires an explicitly separate experiment, not this import path.

Each mapping names question, source, exact presented text, normalized code-point
start/end (or both null when unresolved), misleading judgment (boolean or null)
and reason. A resolved span must reproduce the presented text exactly from frozen
source bytes. Multiple source occurrences need an explicit reviewer selection;
unknown or unresolved mappings never receive favorable automatic credit.

The joined-report config may supply `adjudication`. Validate its hashes, reviewed
ledger, preserved question contract, unique excerpt keys and source coordinates
before scoring. Rescore the original immutable stdout using augmented labels and
mappings; include the adjudication byte hash in the joined report identity. No
native observation is rewritten or rerun merely because a judgment changed.
Missing or incomplete judgments remain unresolved. Reports retain INCOMPLETE
status until the rest of the comparative protocol has actual evidence.

Acceptance: altered frozen hashes, question semantics, original units, unknown
questions, duplicate mapping keys and incorrect Unicode spans are rejected.
Correct reviewed additions resolve previously unknown evidence, retain duplicate
unit suppression, and distinguish judged misleading output from unknown harm.
Verify with controlled fixtures and saved native observations, then apply all
three independent code reviewers to the same snapshot.

## Comparative quality target

The user's clarified outcome is retrieval quality at least as good as stock full
QMD, with better accuracy as the goal. Model capability alone does not establish
this outcome: evaluate the evidence actually returned on identical frozen
questions, source corpora and relevance judgments, including unanswerable cases.
T06 must include explicit QMD-relative quality gates alongside baseline improvement;
baseline improvement alone cannot establish release readiness. Freeze numerical
metrics, tolerances and uncertainty handling before held-out access. Preserve
per-project/slice results and false-positive judgments, and retain no-rollout
outcomes for failed or inconclusive gates. No QMD parity or superiority is claimed
by the current partial development evaluation.
