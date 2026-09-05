# Retrieval v2 delivery frontier

Status: specified for RV2-T01 offline work and RV2-T02 contract fixtures.
Neither task is verified. T03 remains blocked on reviewed foundation evidence.

## goal

Deliver [R01–R21](retrieval-v2.md#requirements) through RV2-T01–T07. Start
with reproducible native baseline and stock full-QMD evidence on a reviewed
public corpus. Use the [foundation protocol](retrieval-v2-foundation.md) unchanged
for labels, metrics, comparator pins and provider probes. This document makes
the first build handoff explicit; it does not replace either source spec.

## non_goals

No production changes in T01/T02. No release before T06 passes. No tracker
creation, model substitution, agent-as-human review, synthetic relevance proof,
or held-out tuning. T03–T07 details remain provisional until their dependencies
expose the real implementation constraints.

## decisions

- The current implementation request supersedes R21's historical “plan only now.”
  This workflow step publishes specifications only; the next step builds T01.
- Use the existing branch based on main. Preserve supplied discovery artifacts.
  Keep the comparator pinned to `9670f625661e46935ec1523bb70c6dd8b35d48e4`,
  regardless of the delivery branch's newer planning commits.
- Reuse the [ownership decision](../retrieval-v2-design.md). Current code still
  has schema 1 in `src/store.ts`, explicit publication in `src/prepare.ts`, and
  file deduplication/prefix snippets in `src/search.ts`. Do not repair baseline
  behavior in a comparator. Existing synthetic-vector benchmarks measure local
  performance only; they do not satisfy F03/F06 or relevance acceptance.
- Fastify and uv at the research pins are candidate collections. Inspect their
  surrounding Markdown and licenses, then freeze file selection before labels.
  No need to reopen external research until a pin, source, or provider decision
  becomes stale. Recheck live route facts before T02 spending.
- T01 comparative scoring uses the 30 development questions. The evaluator
  freezes the 50 held-out questions and labels outside tuning inputs. Drafts
  remain explicitly unreviewed. Human review, adjudication and held-out custody
  must be evidenced before T01 can pass; a hash alone does not prove review.
- Use one evaluation-only Bun runner with narrow process adapters and pure
  validation/scoring seams. No generic evaluation framework or product flag.

## Interfaces and behavior

Use versioned JSON artifacts. Freeze each artifact's schema and serialization
in the T01 implementation and reproduce hashes from its exact bytes. All source
offsets use zero-based Unicode code points in LF-normalized text, end exclusive,
matching D01. Do not mix byte or UTF-16 offsets into judgment coordinates.

| Boundary                | Required data and invariant                                                                                                                                                                                                                                                                                           |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Corpus manifest         | Project ID, upstream URL/commit, license and notice references, original path, mapped path, original/LF SHA-256. Forward/reverse mapping is deterministic and collision-free within each isolated project.                                                                                                            |
| Questions and judgments | Stable question/evidence IDs, original question, project, intent family, primary/secondary slices, split, answerability, facets, graded spans and reasons. Preserve initial labels and separate adjudication revisions, reviewer identities and review status. Enforce the foundation's exact 80-question allocation. |
| Frozen input identity   | Corpus, question and judgment hashes; adapter/build/runtime/model artifact pins; commands and configuration; regime and repetitions; scoring version/seed. Any changed input creates a new run identity. Do not expose held-out contents to the tuning runner.                                                        |
| Observation             | Run/question/system/repetition identity, start/end and elapsed time, exit status, separate stdout/stderr, parsed ranked excerpts and source mappings, success/error, cache/model-load/stage facts, timing and usage/cost provenance. Missing measurements are null with reason. No credentials in artifacts.          |
| Evidence mapping        | Preserve presented excerpts separately from candidate bodies. Remove only demonstrable output decoration when mapping. Multiple possible locations, normalized whitespace or insufficient excerpts require adjudication; never infer the favorable match.                                                             |
| Resume                  | Persist completed observations without replacement, including failures. Resume only missing units for the same frozen identity. Explicit reruns preserve old failures as separate attempts; do not overwrite them or improve metrics by silently retrying failed observations.                                        |
| Report                  | Foundation metrics, failures/denominators, project/slice counts, paired query intervals and win/tie/loss, all three cache regimes, repetitions, preparation/reuse, known/unknown usage and cost. Incomplete review or missing comparator evidence makes the report incomplete, never a passing comparison.            |

Implementer chooses filenames beneath a dedicated evaluation area in `scripts/`
and `test/`; keep imports under `@/`. Public manifests/licenses and reproduction
instructions belong under `docs/`. Raw corpus, models, outputs, review drafts and
work state belong in configured `paths.work` or evaluator-controlled storage.
Publish reviewed benchmark questions/judgments under docs only after T06's
held-out evaluation. Record custody and hashes in the work plan, not secret data.

## acceptance_criteria

F01–F11 remain authoritative. These scenarios define the next build's checks.

| ID  | Given / When / Then                                                                                                                                                                                                                                                                                              | Foundation |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| S01 | Given pinned public manifests, when fetched into an empty evaluation directory, then every commit/license/hash and reverse mapping validates; changed bytes, duplicate mapped paths or invalid span bounds stop execution before provider calls.                                                                 | F01–F02    |
| S02 | Given draft and reviewed labels, when validating the benchmark, then exactly 30/50 questions and the six slice totals hold, intent families stay in one split, positive spans resolve and human review is required for a passing label gate. Draft fixtures may test machinery but cannot pass the benchmark.    | F02,F06    |
| S03 | Given the pinned native baseline and one development query per slice, when prepared/searched/scored, then its real JSON, failures and presented snippets map to the frozen source; no synthetic vector or modified ranking is called native evidence.                                                            | F03–F04    |
| S04 | Given stock full QMD, when the same smoke set runs, then embedding completion, model checksums, effective settings and actual stages/bypasses are captured. Missing vector tables/models or absent full-mode proof block F03/F06 despite exit zero.                                                              | F03,F06    |
| S05 | Given hand-calculated graded evidence with duplicate spans, facets, clipped excerpts, no answers and errors, when scored, then foundation metrics match, later duplicate gains are zero and errors stay in the required denominators.                                                                            | F04        |
| S06 | Given interrupted observations, when resumed, then existing successes and failures remain intact; changed hashes/configuration create another run. A malformed or truncated observation is diagnosed and retained, never treated as a completed success.                                                         | F05        |
| S07 | Given reviewed development labels and passing smoke checks, when full runs execute, then each development query has at least three repetitions per reported timing regime, cache facts remain explicit and incomplete evidence cannot be reported as verification.                                               | F03,F06    |
| S08 | Given public T02 fixtures, when exact D04/D06 request/response validators run, then valid empty arrays pass and hostile/invalid IDs, literals, schemas, refusals, truncation and D07 failures behave as specified. Local fixtures are distinguished from live schema validity and semantic review.               | F07,F10    |
| S09 | Given a frozen T02 spending estimate/ceiling and development payloads, when the full matrix runs, then 8/24/40 complete candidates across 300/500/700-token targets cover at least ten questions per cell plus 30 expansion calls. Record failures and usage; reaching the ceiling stops with incomplete status. | F07–F08    |
| S10 | Given T02 results, when requesting T03 specification, then exact bundled tokenizer mappings, input/aggregate limits, wrapper shortening, custom-model policy and measured 40-candidate envelope close G01/G02, or T03 stays blocked.                                                                             | F09,F11    |

## next_slice

RV2-T01: manifests → span validation → native baseline → scored report; then
stock full QMD through the same contract. Begin with public file selection and
offline fixture checks. This thin path is an implementation checkpoint inside
T01, not permission to mark T01 complete without all 80 reviewed labels and
native comparator evidence.

The second ready slice is RV2-T02's exact request/validation and public boundary
fixtures. Its live representative exit requires T01 development data. Preserve
the foundation's probe caps and selected Luna-low model; all measured limits
remain unresolved until evidence exists.

## tasks

| ID      | Next implementation checkpoint                                                                                                                                                                | Exit                                                               |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| RV2-T01 | Freeze candidate collections/mappings; validate draft judgment fixtures; build baseline-to-report path; add full QMD; arrange actual review and evaluator custody; complete development runs. | F01–F06 reviewed, reproducible artifacts and comparative evidence. |
| RV2-T02 | Freeze exact serialized requests and controlled validators; research unresolved token/route limits; freeze spend ceiling; execute measured matrix; publish capacity decision.                 | F07–F11 reviewed; G01/G02 closed before specifying T03.            |

All later IDs, requirements and checks remain in the parent spec and the local
delivery plan. T03 prepares/searches original hybrid evidence; T04 adds protected
expansion; T05 adds reranking/excerpts; T06 freezes and evaluates; T07 verifies
release. Each gets a specify pass at its dependency frontier before implementation.

## dependencies

T01 has no task prerequisite. Human label review and full-QMD model/host execution
block its exit, not offline work. T02 public contract work can start independently;
its measurement exit depends on T01 development fixtures and live account access.
T03 requires reviewed T01/T02 and G01/G02. T04 requires T03. T05 requires T04 and
T02. T06 requires T01–T05. T07 requires T06 pass. Failed quality gates preserve
the baseline and prohibit rollout; they do not remove later requirements.

## Compatibility and risks

T01/T02 add no production behavior or runtime dependency. Preserve all baseline
PRD requirements except the explicit R07–R12 supersessions during later slices.
Schema-2 migration, ordinal score semantics and new safe stage errors require
the D07/D08 compatibility checks before release. Benchmark leakage, incomplete
pooling, guessed source mappings, hidden QMD bypasses and incomplete costs can
invalidate the comparison even when scripts pass. Report these states directly.

## open_questions

No irreversible owner decision blocks starting offline T01. Required unresolved
exits: actual human reviewers/adjudication and held-out custody; full-QMD host,
model hashes and stage proof; live Luna-low schema/tokenizer/capacity evidence.
Do not request approval merely to create reversible harness work. When no
authorized evaluator/reviewer is available, finish independent work, then report
the missing human assignment without substituting an agent.

G03/G04/G06 remain T06 development selection, numerical freeze and held-out
release decisions. G05 remains measured complete local overhead at 10,000
passages and 1,536/3,072 dimensions. No measured limit or release pass is claimed.

## qa_procedure

1. Use a fresh disposable evaluation directory. Fetch/validate manifests and
   inspect one reverse-mapped document per project, including Unicode and suffix
   evidence. Verify mismatch stops before execution.
2. Run label, hand-scored metric, malformed-record and resume fixtures. Inspect
   human review records separately; tests cannot certify human involvement.
3. Run one development question per slice with native baseline and stock full
   QMD. Inspect actual excerpts, errors, vector availability and QMD bypasses.
4. After smoke checks and label review pass, run the full development protocol.
   Independently adjudicate uncertain/novel evidence with system identity hidden.
5. For T02, run controlled validators first, then only the declared cost-capped
   live matrix. Inspect exact payload completeness, bundled tokenizer build,
   provider boundaries, reasoning/visible usage and failure records.
6. Run repository checks for implementation changes and publish reproduction
   instructions. Terminal/CLI and clean-machine QA become release obligations
   in T03–T07; browser QA is not relevant to this CLI.
