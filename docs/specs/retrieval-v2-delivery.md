# Retrieval v2 delivery frontier

## goal

Deliver all RV2-T01–T07 in existing implementation PR #2 from the original main
base. The [approved Qwen hybrid amendment](retrieval-v2-qwen.md) governs current
model and task choices. Parent requirements remain unless explicitly amended.

## non_goals

No restart of T01, new provider account, local inference runtime, QMD timing sweeps,
human-testing gate, separate implementation PR or merge.

## decisions

Qwen3-Embedding-8B + prepared local BM25 + Voyage rerank-2.5 through OpenRouter.
Original-query fusion is mandatory; generative expansion requires evidence of
benefit before integration. No-answer behavior and failed-rollout outcomes remain.
Historical OpenAI/Luna contract evidence is retained, not reused as Qwen limits.

## next_slice

T02-Q and T02-R are the next ready, separately owned contract slices. Their
concrete acceptance and interfaces are in the approved amendment. Complete their
focused provider/tokenizer checks, verify and review before specifying T03.

## tasks

| ID      | State                        | Next action / requirement coverage                                            |
| ------- | ---------------------------- | ----------------------------------------------------------------------------- |
| RV2-T01 | Complete/reviewed            | Retain F01–F06, R17–R19 evidence; no new QMD sweeps                           |
| RV2-T02 | Reopened for selected models | T02-Q and T02-R close revised F07–F11/G01/G02; prior evidence retained        |
| RV2-T03 | Blocked on T02-Q/R           | Detail AC01–05/09: source coverage, schema-2, reuse, BM25 and vector CLI      |
| RV2-T04 | Blocked on T03               | Detail AC06/10: protected fusion/deadline; R09 expansion experiment decision  |
| RV2-T05 | Blocked on T04/T02-R         | Detail AC07–10: dedicated rerank, abstention and precise diverse evidence     |
| RV2-T06 | Blocked on T01–T05           | AC11–12: bilingual development supplement, ablations and frozen quality gates |
| RV2-T07 | Blocked on T06 pass          | AC01/09/12: release/migration and actual-dimension performance proof          |

## dependencies

T02-Q and T02-R may run in parallel, with disjoint artifact ownership. Never
start a dependent slice using an unresolved provider limit. Detail later slices
at their frontier. Preserve all R01–R21, with R09/R11/R13 amended explicitly in
the approved stack. Task status and raw evidence live in Cezar run storage.

## acceptance_criteria

The current T02 exit requires cited and probed model-specific contracts, offline
bundled assets, focused failure checks and all three independent reviews. A
successful tiny smoke alone does not close capacity or quality gates. T03–T07
remain undelivered until their own implementation, verification and reviews pass.

## open_questions

Exact Qwen tokenizer/route envelope and Voyage full-candidate envelope are owned
by T02-Q/R. Relevance threshold and release margins are development decisions
before held-out access. No pending user input or credential request.

## qa_procedure

Follow the approved amendment's focused T02 QA; reuse saved comparator outputs.
Verify each product slice through real CLI behavior before independent code review.
Keep the one PR reviewable, coherent commits, failures retained and no merge.
