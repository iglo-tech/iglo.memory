# Retrieval v2 — T04 — protected original fusion and strict search execution

## goal

Preserve the strongest independent lexical and semantic candidates while bounding the whole CLI search to 30 seconds.

## non_goals

No generative expansion call, reranking, final excerpt policy, held-out tuning or new QMD executions. T05 owns final selection; T06 owns quality and frozen thresholds.

## decisions

Use the approved equal original weights with RRF constant 60. Protect top eight from each original channel (union <=16), fill up to40 by fused order with source/offset/ID ties. Count protected passages toward soft two-per-file filling preference; deferred passages fill remaining capacity. Protection wins. Return selected candidates in fused order. Coalesce only identical same-source spans; adjacent/different-location evidence stays distinct.

No-action expansion decision: initial runtime uses only original query. Existing Luna development evidence includes literal/semantic drift, and the approved stack removes its mandatory call. No measured incremental benefit for the new stack justifies another inference stage. T06 may record misses; later expansion needs a separate specified experiment, never an automatic dependency.

Absolute monotonic deadline starts before CLI parsing/worktree/config and covers output serialization. Search invoked as library starts its own deadline unless supplied. Check around synchronous stages and lock acquisition; lock retains min(5s, remaining). Synchronous work cannot be preempted: expired work stops at next boundary, with no subsequent stage or partial stdout. Total expiration takes precedence over any stage error.

Remote search requests: <=2 attempts, <=10s each and remaining total, retries only network/timeouts,429,5xx. Backoff max(250ms, Retry-After); do not send another request if delay cannot fit. Cancel bodies/timers. Invalid JSON/shape/auth/model/budget are terminal. Prepare retains existing4attempt/120s budget. Safe optional stage/reason fields are enums, no arbitrary provider text.

Bound response bodies before JSON parse. Query embedding response ceiling512KiB (ample for default4096 floats); custom oversized responses fail explicitly. Prepare response behavior is unchanged in this slice. Expose a small shared search request seam for T05 rerank rather than a provider framework.

## tasks

Root owns fusion/search/CLI/errors and their tests, integration and commits. Transport worker owns src/search-transport.ts, src/embedding.ts and test/search-transport.test.ts only. Preserve existing embed arguments; optional seventh argument is {deadline:number}. Root calls embed with undefined fifth/sixth defaults and options seventh. Export SearchTransportOptions from the helper. Shared helper requestSearchJson(url, init, {deadline,maxBytes,code}, request=fetch, sleep=Bun.sleep) returns unknown JSON. code is EMBEDDING_FAILED or RERANK_FAILED; root owns AppError optional {stage:'embedding'|'rerank',reason:'transport'|'rate_limit'|'provider'|'invalid_response'|'budget'}. Helper checks deadline and never emits provider bodies. Transport author may use this error interface before root finishes integration. No overlap in owned files.

## acceptance_criteria

Original top8 union survives disjoint80candidate input; duplicate channels cannot inflate counts; multiple useful same-file protected passages survive. Soft diversity changes fill only, deterministic ties/order remain. Empty snapshot uses no credential/API. Expired load/lock/inference/output yields one SEARCH_TIMEOUT and no result. Transient retry count, Retry-After, stalled body, oversized body, invalid result, permanent response and credential redaction have focused executable coverage. Existing prepare retries remain unchanged.

## next_slice

T03 passed all three independent reviews at ffbb882. Implement protected fusion and bounded query transport in disjoint files, then integrate CLI deadline.

## dependencies

Reviewed T03 and revised T02 contracts. T05 waits for verified and reviewed T04.

## open_questions

None blocking implementation; final relevance and latency goals remain downstream evidence gates.

## qa_procedure

Focused deterministic candidate/transport fixtures plus real CLI controlled search, empty snapshot and failure stdout. Run configured checks. No fresh live/QMD/scale run needed for this deterministic slice. Verify before three independent reviews of one committed snapshot.
