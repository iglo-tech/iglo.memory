> September6 final direction: user explicitly approved Luna-low via OpenRouter. Prior alternative selections/blockers below are historical; see docs/specs/retrieval-v2-expansion.md.

> Superseded selection notes below are historical. User now requires current September2026 OpenRouter-only models; GPT4.1/nano and local specialist serving are excluded. See current comparison report once finalized. No local model/runtime integration is authorized.

# Restoring query expansion — 2026-09-05

Question: how should expansion join the approved Qwen/BM25/Voyage stack?

QMD routes typed lex variants to BM25 and vec/hyde variants to vector retrieval. HyDE is a hypothetical answer-shaped passage, not evidence. Sources: https://github.com/tobi/qmd/blob/main/docs/SYNTAX.md and https://github.com/tobi/qmd . Its small model is specialized; parameter count does not prove a general model better at expansion.

Recommendation: restore expansion as a required implementation slice before final rerank integration. Start with openai/gpt-5.6-luna low through existing OpenRouter: repository already measured30 successful expansion schemas, p95 3544.1ms, with semantic drift cases retained (docs/specs/retrieval-v2-token-contract.md). This is evidence of transport/latency, not proof of query quality. Inspect those failures and revise the prompt before new bounded experiments. Gemini3.8Flash is a challenger if Luna still drifts, not a necessary model sweep. OpenRouter public catalog https://openrouter.ai/api/v1/models checked now: Luna structured_outputs/reasoning_effort supported, $0.20/$1.20 per million input/output; Gemini3.8Flash supports structured_outputs/reasoning_effort, $0.75/$3.75. Public catalog support needs served-route validation for a changed contract. No head-to-head expansion quality result exists here.

Proposed behavior: bounded lexical keyword rewrite, semantic paraphrase, and separately evaluated optional HyDE. Preserve identifiers/literals, negation, intent and ambiguity; cross-language rewrite for Polish questions over English docs is a development hypothesis. Original candidates remain protected; original list weights2, expansion1. Rerank all candidates against original question only. Generated text never enters returned source evidence. Keep total deadline and request budget; schedule original embedding concurrently and cancel sibling requests on failure.

No QMD reruns. Compare expansion on/off from shared Qwen corpus and saved comparator outputs, measure newly recovered relevant candidates, harmful drift, end-to-end results, latency/cost. Agent source review and existing labels decide; no manual gate. Status READY for T04-E detail work, not a verified model superiority claim.


## Specialist selection — user correction

Select tobil/qmd-query-expansion-1.7B, initially Q4_K_M locally, replacing Luna as proposed production expander. Exact revision/hash must be frozen from the serving artifact before integration; do not assume current upstream and saved evaluation model are identical. Selection is task fit and existing deployment evidence, not demonstrated superiority over Luna or a claim that 4-bit quantization improves accuracy.

Primary training source https://raw.githubusercontent.com/tobi/qmd/main/finetune/README.md specifies Qwen3-1.7B, SFT LoRA, about2290training examples, lex/vec/hyde output and /no_think prompt. Production is SFT-only; GRPO experimental. Published92% is a rule-based expansion rubric on30queries, NOT retrieval recall/nDCG or Polish quality. Language tag en; Polish capability unverified. Model variants https://huggingface.co/tobil/qmd-query-expansion-1.7B/tree/main include Q4_K_M1.28GB and Q8_02.17GB; those are current file sizes, not runtime RAM or saved comparator pin size.

Larger specialist https://huggingface.co/s-emanuilov/query-expansion-Qwen2.5-7B is trained for expansion on linked5730rowdataset but card publishes no comparable retrieval/Polish benchmark. Do not pick merely for size. Conversational https://huggingface.co/caraman/Qwen2.5-7B-mtrag-query-rewriter-final targets conversation-to-standalone rewriting and its system nDCG is not directly comparable to our singlequestion expansion task.

OpenRouter /api/v1/models catalog checked2026-09-05:431models, no ID/description match for query expansion/query rewriting/qmd-query; neither selected specialist listed. This establishes no advertised route found, not an exhaustive claim about undocumented training of every model. Local compute is user-authorized. Standalone binary/no-daemon and CPU/deadline contracts must now be reconciled explicitly in T04-E1 serving detail; do not silently add an external service or fullQMDdependency. Check saved expansion-only runtime first; no QMD sweep. Status READY for local-serving feasibility, final product integration unverified.
