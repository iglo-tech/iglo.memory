# Retrieval stack within OpenRouter or local compute

Question: Which embedding and search combination best fits iglo.mem's Markdown
memory retrieval, quality goal, standalone CLI and limited CPU budget?
Cutoff/access: 2026-09-05. Status: READY for specification; not a measured winner
on this project's corpus. No implementation changes or QMD execution in this research.

## Recommendation

Quality-first default: `voyageai/voyage-4-large` through OpenRouter for both
passages and queries, a small local BM25 index, reciprocal-rank fusion, then
`voyageai/rerank-2.5` through OpenRouter on a bounded candidate set. Return exact
snapshot excerpts. Start with 20 candidates from each retrieval channel, union
and deduplicate, rerank at most 40, and return up to 8. These counts are starting
engineering choices, not benchmark-established optima.

Use section-aware lossless passages with deterministic path/heading context.
Avoid generated contextual summaries and mandatory LLM query expansion in the
initial design. Revisit expansion only for demonstrated misses. A specialized
reranker directly scores query/passage pairs without generating an ID-selection
answer. This is a simpler initial pipeline, not proof that it always beats Luna.

This recommendation is an inference from the sources and project constraints.
It reverses the premature BGE-M3 commitment and the claim that combining BM25
with embeddings was inherently mistaken. No new inference-provider account.
OpenRouter may route requests upstream; the application's credential and endpoint
remain OpenRouter's.

## Shortlist and evidence

| Option | Role / decision | Evidence and limits |
| --- | --- | --- |
| Voyage 4 Large + BM25 + rerank-2.5 | Recommended quality-first hosted stack | Current OpenRouter catalog and actual tiny requests work. Voyage reports strong retrieval results across 29 RTEB datasets; vendor evidence, not a head-to-head win over every candidate here. |
| Qwen3 Embedding 8B + BM25 + same reranker | Best shortlisted low-price alternative | Current OpenRouter price starts at $0.01/M input tokens versus Voyage's $0.12/M. Qwen reports strong retrieval benchmarks and supplies instruction-aware embeddings. Actual route works. |
| BGE-M3 dense+sparse locally | Viable if local/offline operation becomes the priority | Official implementation exposes dense, sparse and multi-vector outputs. Requires local model/runtime packaging and measured startup/RAM/CPU behavior. Not chosen solely because it unifies two representations. |
| BGE-M3 via OpenRouter | Dense embedding option, not the promised unified replacement | Documented OpenRouter embedding contract does not establish sparse output. Do not assume model functionality equals API functionality. |
| Qwen3 Embedding 0.6B locally + BM25 | Practical local shortlist candidate | Official GGUF distribution exists. CPU performance on this host is unmeasured; no claim that its latency is better than BGE-M3. |
| Voyage 4 Nano locally + BM25 | Interesting smaller local alternative | Official model card lists 340M total parameters, Apache-2.0, and compatibility with Voyage 4 embedding space. Runtime integration still needs proof. |
| Voyage Code 4 | Reserve for code-heavy corpus | Available through OpenRouter and designed for code retrieval. This project indexes prose Markdown with code examples, not entire source trees; code benchmark leadership does not establish a better default here. |
| Gemini Embedding 2 / pplx-embed-v1 | Credible alternatives, not initial additional experiments | Present in current OpenRouter catalog. Gemini's multimodal capacity is unnecessary here; Perplexity's small model/quantization is interesting if local/storage constraints dominate. Neither is ruled out on quality. |

Sources: [OpenRouter live embedding catalog](https://openrouter.ai/api/v1/embeddings/models),
[Voyage 4 evaluation](https://blog.voyageai.com/2026/01/15/voyage-4/),
[Qwen model/evaluation](https://huggingface.co/Qwen/Qwen3-Embedding-8B),
[BGE-M3 model](https://huggingface.co/BAAI/bge-m3),
[Qwen GGUF](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF),
[Voyage Nano](https://huggingface.co/voyageai/voyage-4-nano),
[Voyage Code 4](https://blog.voyageai.com/2026/08/13/voyage-code-4/),
[Perplexity model](https://huggingface.co/perplexity-ai/pplx-embed-v1-0.6b).

Qwen's published multilingual retrieval column reports BGE-M3 54.60, OpenAI
3-large 59.27, Qwen3-0.6B 64.64 and Qwen3-8B 70.88. These are historical embedding
benchmark results, not BGE's full hybrid pipeline versus ours. The all-task mean
is a different metric. Do not mix MTEB and RTEB scores or treat either as a score
for this CLI. [Qwen evaluation](https://huggingface.co/Qwen/Qwen3-Embedding-8B#evaluation)

BM25 remains useful for literal error codes and identifiers. Anthropic's retrieval
experiment supports combining lexical and dense retrieval; its generated-context
improvements cannot be attributed to BM25 alone or assumed for our deterministic
heading prefixes. [Experiment](https://www.anthropic.com/engineering/contextual-retrieval)
BGE's own authors also recommend hybrid retrieval plus reranking.

Voyage reports rerank-2.5 gains over Cohere v3.5 on 93 datasets. That does not
prove superiority to newer Cohere Rerank 4 Pro, also currently listed on
OpenRouter. Choose Voyage as a defensible starting point, not a universal winner.
[Vendor study](https://www.mongodb.com/company/blog/product-release-announcements/rerank-2-5-and-rerank-2-5-lite-instruction-following-rerankers),
[OpenRouter model catalog](https://openrouter.ai/api/v1/models).

## Minimal live capability evidence

Three requests, existing OpenRouter credential, no local model inference:

- Voyage 4 Large: HTTP 200, two finite 1024-dimensional vectors, 17 billed tokens,
  reported cost $0.00000204, observed wall time 610 ms.
- Qwen3 8B: HTTP 200, two finite 4096-dimensional vectors, 19 billed tokens,
  reported cost $0.00000019, observed wall time 271 ms.
- Voyage rerank-2.5: HTTP 200, returned both indices; configuration passage
  0.91015625 above unrelated restaurant passage 0.1943359375; 21 billed tokens,
  reported cost $0.00000105, observed wall time 229 ms.

Inputs were two synthetic sentences: “The project configuration is stored in
.agent/memory.json.” and “The restaurant serves fresh pasta.” Rerank query:
“Where is project configuration stored?” POST `/api/v1/embeddings` with model,
input array and encoding_format float; POST `/api/v1/rerank` with model, query,
documents and top_n 2. No new credential. Total reported cost $0.00000328.
These observations are capability smoke checks, not quality or latency benchmarks.
Their summaries are recorded here; raw responses were not persisted.

## Conflicts and integration risks

- OpenRouter's `/rerank/models` returned 404, but rerank models appear in `/models`
  and an actual `/rerank` call succeeds. One rerank reference URL also failed;
  the [RAG guide](https://openrouter.ai/docs/cookbook/evaluate-and-optimize/rag)
  and live request establish the usable endpoint.
- Reranker catalog prompt/completion prices are zero; do not infer free service.
  The actual request returned a nonzero cost. Validate real candidate-batch cost
  during implementation, rather than using the misleading catalog fields.
- OpenRouter lists BGE context as 8194 while a provider lists 8192. Qwen provider
  limits also vary (32000/32768). Published model maxima are not a provider-safe
  input contract. Verify tokenizer, special tokens and no-truncation behavior.
- OpenRouter's generic supported_parameters fields include chat controls even on
  embedding models; they do not prove support for sparse vectors, dimensions or
  query/document task fields. Verify selected parameters explicitly. Voyage smoke
  used the default 1024 dimensions; do not assume 2048 without a capability check.
- Local inference is now permitted by the user, superseding the old prohibition.
  It still entails model assets and runtime integration. Parameter counts alone
  cannot establish CPU latency; this research downloaded no weights.
- Published comparisons are mostly vendor-run and differ in dataset/mode/date.
  [RTEB methodology](https://huggingface.co/blog/rteb) explains the importance of
  retrieval-specific evaluation. No global “best” claim is established here.

## Implications for specify

Keep original source ownership, worktree isolation, atomic prepare, vector reuse,
precise snippets, honest abstention/no-rollout and frozen held-out custody.
Replace the new DeepInfra dependency entirely. Reopen the BGE-specific amendment;
reintroduce a compact lexical channel and replace mandatory generative reranking
with the dedicated endpoint. Expansion becomes an evidence-driven later option.
These are proposed spec changes, not changes implemented by this research.

Small next decision experiment: same prepared passages and 30 existing development
questions, one pass each for Voyage and Qwen, with/without the lexical channel;
rerank each fused candidate set once. Reuse outputs for metric variants and reuse
all saved QMD evidence. No cold/warm sweeps or repeated API boundary matrices.
Prefer one quality-first configuration; keep Qwen if results tie within the small
sample and its actual latency/cost is better. Freeze before held-out access.

Open: project-specific ranking winner; production-sized rerank latency/cost;
selected-route tokenizer/truncation/task-parameter behavior. None requires another
provider account or further QMD foundation runs. Research is complete; implementation
remains paused for the revised specification handoff.

## Numerical evidence follow-up

User requests objective numbers before any decision. Prior recommendation is
provisional; it is not a demonstrated ranking of complete candidate pipelines.
Accessed 2026-09-05. No new inference or QMD runs for this follow-up.

Verified comparable sources:

1. [Qwen evaluation table](https://huggingface.co/Qwen/Qwen3-Embedding-8B#evaluation):
   multilingual retrieval column, distinct from all-task mean; historical May/June
   2025 snapshot. Qwen3-8B 70.88, Qwen3-4B 69.60, Qwen3-0.6B 64.64,
   OpenAI3large 59.27, BGE-M3 dense 54.60. No OpenAI-small row.
2. [BGE paper v4](https://arxiv.org/html/2402.03216v4): use latest June 2024
   revision, not v3 MIRACL numbers. Tables 3/4/11 distinguish full hybrid,
   dense-only and BM25 analyzer settings. MLDR training exposure disclosed.
3. [Voyage reranker numerical workbook](https://docs.google.com/spreadsheets/d/1fRuqfNfWVy8Ua5XvbJycpgC6GTUH3OctXJhDJPmAeY0/edit):
   rows 4–18; domain mean including multilingual, TECH and CODE aggregate columns.
   Method: up to100 candidates, nDCG@10; vendor-run, August2025.
   Technical ranking differs from aggregate ranking; no claim of universal winner.
4. [Anthropic controlled retrieval study](https://www.anthropic.com/engineering/contextual-retrieval):
   failure@20 5.7/3.7/2.9/1.9 percent. Context generation and reranking are distinct
   changes; reranker Cohere, embedding configuration Gemini Text004.
5. [Voyage4 workbook](https://docs.google.com/spreadsheets/d/1d-06Fh_LqAGBEEIbHN95OxccXcMWYq5uJ0e9LFKaPI8/edit):
   accessible workbook contains asymmetric Voyage-family evaluations, not the
   claimed full RTEB cross-model table. Blog chart lacks printed precise values.
   Do not invent exact scores by reading bar heights or derive them from ambiguous
   relative-percent statements. Qwen/BGE absent from that displayed comparison.

Unsupported: complete Voyage4large+BM25+rerank2.5 versus Qwen3+BM25+rerank2.5
versus BGE dense+sparse versus OpenAI-small+BM25 on identical Markdown corpus.
No measured project winner; remain in research/decision phase. Data supports
shortlisting, not another unconditional architecture commitment.

## Language evidence follow-up

Access 2026-09-05. Multilingual support is established, English parity is not.
Separate same-language retrieval, cross-language retrieval, and code identifiers.

Voyage reranker workbook rows12/16/18 uses fixed OpenAI3large first-stage;
French/German/Japanese/Korean/Spanish aggregates are BJ/BQ/BW/CC/CI. Scores are
nDCG@10; language datasets differ, so differences across columns are not a
controlled estimate of a language penalty. It does not evaluate Voyage4 embeddings.
Source: https://docs.google.com/spreadsheets/d/1fRuqfNfWVy8Ua5XvbJycpgC6GTUH3OctXJhDJPmAeY0/edit

BGEv4 table2 MKQA: 25 non-English query languages search English Wikipedia.
Dense75.1, sparse45.3, dense+sparse75.3, all75.5 Recall@100 averages. Polish
query subset: dense76.3/sparse46.1/dense+sparse76.3/all76.6. This is not
Polish-document retrieval evidence. Sparse is lexical even when learned.
Source: https://arxiv.org/html/2402.03216v4

Qwen's earlier cited 70.88/69.60/64.64 retrieval scores already come from the
multilingual benchmark, not English-only. They do not establish per-language or
full hybrid-stack parity. No identical-input English/Polish translated experiment
for the proposed full stacks is currently in evidence. Frozen existing project
corpus does not validate multilingual quality. No model or QMD execution here.

## Polish morphology follow-up

Polish-specific evidence accessed2026-09-05: BEIR-PL table1 compares original
English with machine-translated Polish; not a clean isolation of morphology.
https://arxiv.org/html/2305.19840v1
PIRB (41 Polish tasks) tables1/3 directly support dense retrieval and modest
incremental hybrid gains. Hybrid uses trained LambdaMART, not our proposed RRF.
https://arxiv.org/html/2402.13350v1

Implication: lowercase/no-stemming identifier lexical contract is not a verified
Polish prose retriever. Do not gate dense candidates on lexical matches or assume
equal channel weights. Preserve exact identifier matching; evaluate language-aware
lexical analysis separately. BGE-M3 sparse is not automatically SPLADE expansion.
No pipeline winner asserted, no implementation/inference/QMD.

## Decision-oriented synthesis

Question: Which practical retrieval stack should mixed Polish/English Markdown use with OpenRouter/local only?
Cutoff: 2026-09-05; primary sources accessed today.
Recommendation (engineering judgment): Qwen3-Embedding-8B through OpenRouter, local vector search plus auxiliary exact identifier/path matching, Voyage rerank-2.5 through OpenRouter. Semantic candidates remain independent of lexical matching. Preserve heading context, evidence coordinates, no-answer behavior and all agreed product outcomes. Candidate budget and excerpt selection require specification; this is not an implemented pipeline.

Why this supersedes earlier provisional Voyage4large default: Polish-specific evidence now informs selection; broad vendor averages alone cannot establish Polish quality. PL-MTEB Table7 gives Qwen8B59.21, Qwen4B56.65, E5large52.43 and Polish specialist stella-pl-retrieval-8k61.59 nDCG@10. Qwen is not the Polish retrieval winner; overall first place is not retrieval first place. Training overlap differs (retrieval zero-shot72 versus54 for Stella). BGE-M3 itself and Voyage4 are not directly evaluated in this table.
Source: https://aclanthology.org/2026.findings-acl.1773.pdf

Broader multilingual retrieval comparison supports Qwen8B70.88 versus OpenAI3large59.27/BGE-M3dense54.60, but does not compare complete hybrids or guarantee project gains.
Source: https://huggingface.co/Qwen/Qwen3-Embedding-8B

Choose Voyage rerank2.5 based on previously verified multilingual/technical retrieval evidence and working OpenRouter smoke check. Its vendor study fixes OpenAI3large retrieval and reports technical nDCG10 rising53.56 to62.93 (Qwen reranker60.35). This is not a Qwen-embedding pipeline or a Polish-specific reranker proof.
Source: https://blog.voyageai.com/2025/08/11/rerank-2-5/
Source: https://docs.google.com/spreadsheets/d/1fRuqfNfWVy8Ua5XvbJycpgC6GTUH3OctXJhDJPmAeY0/edit

Implications for specify: favor semantic retrieval for Polish inflection/paraphrase; retain lexical support for identifiers; avoid committing to language-specific morphology infrastructure or local model serving before demonstrated need. Reconsider mandatory generative expansion as an evidence-driven addition while preserving agreed requirements. One focused bilingual development check should assess Polish inflections, Polish-to-English queries, identifiers and no-answer cases; agent supplies labels. Reuse existing QMD outputs, no new CPU timing sweeps. Full-stack superiority remains an acceptance target, not a benchmark-proven fact.
Open: complete stack on project data, Polish reranker contribution, final provider capacity and failure contracts.
Status: READY for specification; implementation remains paused under research instruction.

## BM25 alternatives under Bun/OpenRouter/local constraints

Question: Is there a better lexical retrieval alternative usable by this project?
Cutoff/access: 2026-09-05.
Finding: Learned sparse retrieval (SPLADE and related document-expansion models) is a real quality alternative, not a JS index-library swap. PIRB Polish SPLADE++52.93 versus BM2541.85; fine-tuned E5large hybrid SPLADE58.66 versus hybridBM2558.47 shows standalone superiority is not equivalent to large incremental hybrid improvement.
https://arxiv.org/html/2402.13350v1

OpenSearch multilingual-v1 offers document-only model inference; queries use tokenizer and IDF lookup, scoring is sparse inner product. Official code works outside OpenSearch with Python/Transformers, so a Bun-managed local worker is a feasible design; direct Bun/ONNX execution is unverified. No need to deploy an entire OpenSearch cluster for model inference plus custom local indexing. MIRACL vendor table62.9 versus BM2530.5, but Polish absent from evaluated/language-tag list; cannot claim Polish quality. Index-time CPU cost remains unmeasured. Model size documentation differs160M modelcard/168M OpenSearch docs; avoid precise resource claim.
https://huggingface.co/opensearch-project/opensearch-neural-sparse-encoding-multilingual-v1
https://opensearch.org/blog/advancing-search-with-opensearch-v3-neural-sparse-models-and-a-multilingual-retrieval-model/

OpenRouter embeddings API documents dense embedding output, no sparse token-weight contract found. Listing BGE-M3 there does not establish its sparse output availability. No additional provider signup requested.
https://openrouter.ai/docs/api/api-reference/embeddings/submit-an-embedding-request

Recommendation: keep Qwen3 dense + local BM25 + Voyage reranker as implementable default. Learned sparse is the credible replacement candidate if local model packaging/indexing cost is justified; no evidence yet for its incremental gain alongside Qwen and reranker on Polish docs. Preserve identifiers in lexical tokenization; no restriction to identifier-only search. This corrects the earlier overly narrow exact-match recommendation. Research only; no new inference, QMD or code.
Status: READY for decision/specification. Open: Bun execution proof, local resource costs and project-specific incremental gain.
