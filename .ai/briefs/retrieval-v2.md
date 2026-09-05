# Retrieval v2 brief

Status: shaped for all RV2-T01–T07. Ready to build T01's offline foundation;
not verified for comparison or release. No production work in this shape step.

## Problem, users and outcome

Coding agents need useful evidence from the current worktree's project Markdown.
The baseline mixes cosine with fixed lexical bonuses, returns one chunk per file,
and clips the beginning of each chunk. It can miss rare identifiers, suffix
evidence and multiple answer facets. These are design limitations, not measured
benchmark failures yet.

The primary user is an agent asking one project question. The secondary user is
the developer maintaining canonical Markdown and explicitly preparing snapshots.
The evaluator needs reproducible evidence to decide whether v2 merits release.

Deliver better held-out useful-result@8 and nDCG@8 than the pinned baseline,
without identifier-usefulness or misleading-no-answer regression, while keeping
one standalone Linux x86_64 CLI. Quantify the gap to stock full QMD honestly.
Freeze numerical margins, uncertainty treatment, error and performance limits in
T06 before held-out scoring. The 5 s / $0.01 p95 values remain initial goals.

The [parent spec](../../docs/specs/retrieval-v2.md) and
[foundation spec](../../docs/specs/retrieval-v2-foundation.md) govern exact contracts.
They supersede conflicting baseline PRD behavior. The historical “plan only now”
does not cancel this run's implementation request; this step itself only shapes.

## Scope and delivery order

| Task | Outcome and acceptance intent | Dependency / detail point |
| --- | --- | --- |
| RV2-T01 | Frozen corpus, 80 human-reviewed questions, baseline and stock full-QMD report; F01–F06 | Start now with manifests → span judgments → native baseline-to-report harness, then QMD. Human review and comparator evidence are mandatory exits. |
| RV2-T02 | Exact Luna-low schemas/prompts, bundled tokenizers and measured complete-payload envelope; F07–F11 | Public fixtures can start independently; representative exit uses T01 development fixtures. Close G01/G02 before T03. |
| RV2-T03 | Lossless contextual passages, schema-2 receipts/provenance, prepared BM25, original lexical/vector CLI evidence; AC01–05,09 | Reviewed T01/T02. Specify measured chunking/capacity and migration details before implementation. |
| RV2-T04 | Validated expansion and fusion preserving original top-eight lexical/vector candidates; AC06,09–10 | T03. Specify stage scheduling, literal validation, candidate selection and deadline behavior. |
| RV2-T05 | Original-question reranking, multiple useful passages per file, exact snapshot excerpts and ordinal scores; AC07–10 | T04 plus T02 schema contract. Specify selection, presentation and strict failure integration. |
| RV2-T06 | Development selection, shared-input ablations, frozen gates and locked held-out comparison; AC11–12 | T01–T05. Specify experiment/freeze protocol before implementation and held-out access. |
| RV2-T07 | Standalone release candidate, migration and reproduction docs, terminal/clean-machine/scale proof; AC01,09,12 | T06 pass. Specify release verification before implementation. Failed gates preserve the baseline and prohibit rollout/parity claims. |

T03–T05 intermediate behavior stays on an isolated branch; it is not an extra
search mode. The full requested scope remains all seven tasks even when a gate
blocks later delivery.

T01 retains the exact 30 development / 50 held-out allocation: paraphrase 8/12,
identifiers 6/9, ambiguity 4/6, long/suffix 4/6, facets 4/6, unanswerable 4/11.
Keep intent families within one split. Pin iglo.mem at
`9670f625661e46935ec1523bb70c6dd8b35d48e4` plus at least two unrelated public
collections, with licenses, original/LF hashes and reversible path mappings.
Candidate Fastify/uv pins in the research are reversible selections until
collection inspection and manifest freeze, not accepted corpora or labels.

The evaluator controls held-out questions/judgments outside tuning inputs. Freeze
and hash them in T01; publish the reviewed benchmark under docs only after T06
held-out evaluation. T01's comparative report uses development questions. Agent
drafts never satisfy the required human reviews or disagreement adjudication.

Score presented evidence separately from full candidate text, at 1/3/5/8, with
graded nDCG, facets, unique span coverage, misleading no-answer rates, failures,
per-project/slice counts, paired bootstrap intervals and win/tie/loss. Unknown
usage stays null with reason. Keep cold, novel-warm and repeated-cache timing
separate, with at least three development repetitions. Verify metric fixtures,
hash mismatch/resume and one query per slice before full development runs.

## User journeys and compatibility

The interface remains the existing terminal/JSON flow. No screens or visual
redesign are needed. Init keeps hidden key entry, terminal restoration and shared
external credentials; noninteractive callers never receive a prompt. Prepare
publishes a complete snapshot or preserves the prior bytes. Search emits one JSON
result or safe error, without reading sources or writing the index.

An agent can ask a paraphrase, exact identifier or multi-facet question and receive
up to eight source-owned passages, including several from one file. Empty
snapshots need no network. Valid empty model selections succeed; provider,
validation and timeout failures remain errors without partial results. Removed
or edited source files do not alter prepared evidence until prepare runs again.

Schema-1 search/status/GC reject with prepare guidance. Migration is explicit.
Response v2 retains existing fields, adds precise snippet coordinates and marks
scores ordinal; clients must stop applying baseline score thresholds. Document
that chat stages send questions and candidate text to OpenRouter. Preserve JSON
stdout, stderr diagnostics and keyboard-only terminal setup. Existing terminal
and CLI QA supply accessibility/interaction evidence; no prototype or browser
proof is justified for this scope.

## Alternatives and non-goals

- Do nothing: retain baseline if evidence cannot justify v2 rollout. It does not
  satisfy the requested investigation and implementation, so begin T01.
- Reuse QMD as the product: rejects standalone/no-local-model constraints. Use
  stock QMD only as an isolated evaluator dependency.
- Ship BM25 alone: useful T03 intermediate evidence, but omits requested expansion,
  reranking and comparison. Do not call it complete v2.
- Smallest reversible start: offline manifests, label validation and a native
  baseline-to-report harness. Reuse current CLI/build and filesystem safety seams.

No answers, new roots, daemon, local product models, database service, persistent
search cache, cross-worktree index sharing, background refresh, alternate modes,
additional provider/credential service or platform. No synthetic relevance proof,
model substitution, favorable guessed evidence mapping or relaxed held-out gates.

## Decisions, evidence and open gates

Architecture ownership is recorded in the
[design note](../../docs/retrieval-v2-design.md). Source inspection and external
research are in [research](../research/retrieval-v2-foundation.md); they are not
live provider, QMD, prototype or production verification.

Required blockers remain: no independent human reviewer assigned (F02/F06); no
full-QMD execution evidence (F03/F06); no exact tokenizer/aggregate limits,
compiled-assets, custom-model sizing or live Luna-low schema/capacity proof
(T02/G01/G02). QMD may skip vectors if its table is absent; successful exit alone
does not prove full mode. Preserve native bypasses and inspect actual stages.

T02 must freeze a spending estimate/ceiling before its 8/24/40 × 300/500/700 matrix
(at least ten development questions per cell and 30 expansion calls). Do not
assume account access, billed cost or host capacity from catalog/source evidence.
G03/G04/G06 remain T06 decisions; G05 requires complete local load/ranking scale
measurements at 10,000 passages and both specified vector dimensions.

No user decision blocks completing shape or starting offline T01. The T01 owner
must arrange actual human review before declaring labels verified; if unavailable,
record a blocked exit rather than substituting an agent. Later specification
must resolve its required gates rather than inherit guessed limits.

Next: build
Brief: .ai/briefs/retrieval-v2.md
