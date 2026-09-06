> September6 final direction: user explicitly approved Luna-low via OpenRouter. Prior alternative selections/blockers below are historical; see docs/specs/retrieval-v2-expansion.md.

> WITHDRAWN: user rejected flagship/generalist substitution. This screen is historical, not an approved deployment choice. See retrieval-v2-specialist-availability.md.

# Query expansion model choice — September 5, 2026

**Select `openai/gpt-6-astra`, reasoning low, through OpenRouter, for the quality-first expansion implementation.** This replaces rejected local specialist and GPT4.1/nano proposals. No local inference. It is a current model released September4 according to [OpenRouter](https://openrouter.ai/openai/gpt-6-astra); availability, schema support and returned model/provider were checked in actual requests.

## Direct current-model screen

Identical corrected prompt, eight queries each (four English/four Polish),32requests, no retries, no QMD or local inference. These are difficult development cases from prior intent failures and translated counterparts, not heldout data. All models used1024output cap; low reasoning for Astra/Sonnet, minimal for Gemini, disabled for Qwen. Reasoning controls/providers differ and are recorded, so this compares intended serving configurations, not identical compute. Requests ran with concurrency4 and20sresearch timeout; production attempt cap remains10s.

| Model | Accepted / qualified / rejected | Median request | Maximum | Mean reported cost/request |
| --- | --- | --- | --- | --- |
| GPT-6 Astra | 8 / 0 / 0 | 2.63s | 3.32s | $0.007175 |
| Claude Sonnet5 | 6 / 2 / 0 | 2.75s | 4.35s | $0.002790 |
| Gemini3.8Flash | 7 / 1 / 0 | 3.76s | 14.04s | $0.000833 |
| Qwen3.8Flash | 3 / 3 / 2 | 2.52s | 6.69s | $0.000058 |

Grades are source-language/intent/format judgments, **not retrieval accuracy percentages**. Root and independent reviewer saw anonymous packets before model mapping. Independent initial26A/4Q/2R and root24A/5Q/3R retained; adjudicated24A/6Q/2R after explicit fivecase decisions. Sonnet qualifications: sharing→usage broadening and dropped flag prefix in one lexical variant. Gemini qualification: invented across-components scope; one request exceeds production10sattempt cap. Qwen produced punctuation-only inputs once and unsupported dependency behavior once. Astra preserved testedPolishmeaning, identifiers and originalquestion intent, with no invented specificHyDEfacts in this set.

Astra is selected for observed output fidelity, not newest-model status or parameter count. Sonnet remains the measured cheaper challenger, not an automatic fallback. The sample is too small to establish population error rates or p95latency; max is reported instead. Astra's maximum observed expansion cost was$0.01001, so the original$0.01whole-search goal is NOT established and may fail. Preserve that gate; don't disguise this tradeoff. Wholepipeline retrieval benefit still requires T04-E/T06 development evaluation. Abstract topic-like HyDE here is more conservative than QMD's answer-shaped hallucination; test contributions separately rather than claiming equivalent method.

## Evidence and prior failed approaches

Raw plans, prompts, catalog, request outputs, returned providers, costs, anonymous mappings/reviews/adjudication and measurements: ignored `.ai/cezar/runs/retrieval-v2/expander-comparison-current/`. Current round cost$0.086849912; previous rounds$0.02659726; total$0.113447172 within declared$1researchceiling. No cost values missing.

First genericHyDEprompt produced invented facts across four generators. Explicit counterexamples plus bounded schema improved outputs; original failures retained. GPT4.1/nano and Qwen2.5 rounds are excluded from deployment selection per user's recency requirement. [QueryGym](https://leaderboard.querygym.com/methods/query2e/) and its [paper](https://arxiv.org/html/2604.27421v1) inform method selection only; older generator results cannot prove currentmodelquality. [Jina](https://github.com/jina-ai/llm-query-expansion) likewise tests Gemini2.0, not3.8. No public current-model same-stack multilingual expansion benchmark was found; the fresh screen supplies bounded decision evidence without inventing such a benchmark.

Next: detail Astra typed expansion transport/validation/cancellation/budgets before implementation. Keep original query protected and rerank against it. Verify revised model-specific fullquery capacity; smallscreen alone does not close envelope gate. No human test or new provider setup required.
