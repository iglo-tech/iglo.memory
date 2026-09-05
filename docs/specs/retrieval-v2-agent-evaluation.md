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
