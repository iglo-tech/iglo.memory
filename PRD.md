# PRD: iglo.mem — Repo-Local Semantic Memory CLI

## 1. Product Summary

Build a standalone CLI called `iglo.mem`.

It indexes Markdown files inside a Git repository, generates embeddings through OpenRouter's embeddings API, persists a searchable snapshot inside the repository, and returns the most relevant Markdown sections for a natural-language query.

The tool is designed for AI coding agents working in Git worktrees.

Run `iglo.mem init` to set up a repository. On first interactive setup, it asks for an OpenRouter API key if none is available and saves it outside the repository for reuse by all worktrees and repositories belonging to the same OS user.

Prepare data once after creating a worktree, and rerun preparation whenever the index should be refreshed, including from an external cron job:

```bash
iglo.mem prepare
```

The agent then searches the prepared data:

```bash
iglo.mem search "How does authentication work?"
```

`prepare` owns source scanning, change detection, chunking, and document embedding. `search` only embeds the query and searches the last successfully prepared snapshot. It never checks Markdown files for changes, updates the index, or repairs missing data. If it cannot search, it returns a JSON error and exits nonzero.

## 2. Core Principles

1. Markdown files are the source of truth.
2. Embeddings are derived, cacheable artifacts.
3. The tool has one search workflow.
4. The tool has one default configuration.
5. The tool returns one response format.
6. Search operates only on the current worktree's prepared snapshot.
7. Only preparation sends missing or changed document chunks to the embedding API.
8. The executable has no runtime dependencies.
9. API keys are never stored in the repository.
10. The tool never modifies Markdown source files.
11. Index freshness is controlled explicitly by `prepare`, never by `search`.

## 3. Scope

The application must:

- scan configured Markdown sources;
- split Markdown into deterministic chunks;
- calculate content hashes;
- reuse existing embeddings;
- send only missing document embeddings to OpenRouter during preparation;
- persist chunk text and source metadata for search without source access;
- embed the user query;
- compare the query vector against stored vectors;
- rank the most relevant results;
- include exact-match signals as a ranking bonus;
- return source paths, headings, line ranges, scores, and snippets;
- work correctly in multiple Git worktrees;
- save all derived index data inside the repository;
- compile into a standalone executable with Bun.

The application must not:

- run local embedding models;
- require QMD, Obsidian, SQLite, a vector database, or a daemon;
- automatically summarize conversations;
- automatically decide what should become permanent knowledge;
- expose multiple search modes;
- integrate directly with embedding providers other than OpenRouter;
- scan, synchronize, rebuild, or repair the index during search;
- install hooks, cron jobs, or background watchers automatically;
- store API keys in repository files;
- index the entire codebase by default.

## 4. Repository Layout

The repository uses the following fixed structure:

```text
.agent/
  memory.json
  knowledge/
  decisions/
  inbox/
  memory-index/
```

Indexed sources:

```text
.agent/knowledge/**/*.md
.agent/decisions/**/*.md
```

Excluded sources:

```text
.agent/inbox/**
.agent/memory-index/**
.git/**
node_modules/**
dist/**
build/**
```

The inbox is excluded because it contains unverified observations. The application only searches canonical knowledge and accepted decisions.

## 5. Configuration

The only repository configuration file is:

```text
.agent/memory.json
```

Default configuration:

```json
{
  "project": "example-project",
  "embedding": {
    "model": "openai/text-embedding-3-small"
  }
}
```

OpenRouter is the only API integration. The model is configurable using an OpenRouter embedding model ID. The endpoint and credential environment variable are fixed, following the [OpenRouter embeddings guide](https://openrouter.ai/docs/api_reference/embeddings) and [API reference](https://openrouter.ai/docs/api/api-reference/embeddings/submit-an-embedding-request).

```text
POST https://openrouter.ai/api/v1/embeddings
Authorization: Bearer <resolved OpenRouter API key>
Content-Type: application/json
```

Request format:

```json
{
  "model": "openai/text-embedding-3-small",
  "input": ["text to embed"],
  "encoding_format": "float"
}
```

Document batches and individual queries use this same endpoint and model. Queries use a single-element input array. Only text inputs and float vectors are required; no SDK, model discovery, or provider-routing configuration is required.

Relevant response fields:

```json
{
  "data": [
    {
      "index": 0,
      "embedding": [0.1, 0.2, 0.3]
    }
  ]
}
```

Response vectors must be associated with their inputs using `index`, rather than assuming response order. Reject missing, duplicate, or out-of-range indices and vectors with invalid dimensions, non-finite values, or zero magnitude.

### Shared credentials

Resolve the OpenRouter key in this order:

1. A non-empty `OPENROUTER_API_KEY` environment variable.
2. `openrouter.apiKey` from `~/.config/iglo.mem/credentials.json`.
3. If neither exists, interactive `init` prompts for it; commands that require an API request fail with `API_KEY_MISSING` and setup instructions.

The credentials file has this format:

```json
{
  "openrouter": {
    "apiKey": "<OpenRouter API key>"
  }
}
```

Resolve `~` from the OS user's home directory, independently of the repository or working directory. This is one plaintext file shared across that user's repositories and worktrees on the same machine, protected by owner-only filesystem permissions. It is not copied into worktrees or synchronized through Git.

Create the application credentials directory with mode `0700` and the credentials file with mode `0600` (or equivalent owner-only ACLs). Save atomically using a temporary file with the same restricted permissions. Do not follow credential-file symlinks or store credentials inside a Git worktree. A malformed, unreadable, or insecure existing credentials file produces `CREDENTIALS_INVALID` with repair instructions; do not silently overwrite it or treat it as missing. An environment override does not require reading the saved file and is never persisted automatically.

Credential loading is shared by `init`, `prepare`, and `search`. Only `init` may prompt or save credentials. Changing the API key does not change the embedding profile or require re-embedding documents.

## 6. Embedding Profile

The index must record the embedding profile used to create every vector:

```json
{
  "profile": "sha256:<hash-of-profile-settings>",
  "baseUrl": "https://openrouter.ai/api/v1",
  "model": "openai/text-embedding-3-small",
  "dimensions": 1536,
  "encodingFormat": "float",
  "chunker": "markdown-sections-v1"
}
```

The profile identifier must change when any of the following changes:

- base URL;
- model;
- dimensions;
- input formatting;
- chunking algorithm;
- normalization behavior.

Vectors from different profiles must never be compared.

The dimensions are discovered from the first successful API response during preparation and then enforced for all subsequent document and query vectors. An empty snapshot may record null dimensions until documents are prepared.

Search validates the stored profile and project against the current configuration and supported implementation versions. Incompatible settings require `iglo.mem prepare`; search never rebuilds or compares incompatible vectors.

## 7. Markdown Chunking

The application uses one deterministic chunking strategy:

1. Normalize line endings to LF.
2. Parse Markdown headings.
3. Create sections from headings.
4. Keep code blocks intact.
5. Split oversized sections at paragraph boundaries.
6. Use a maximum chunk size of 5,000 characters.
7. Use a 500-character overlap only when an oversized section must be split.

Each embedding input has this format:

```text
Project: example-project
File: .agent/knowledge/authentication.md
Section: Refresh token rotation

<Markdown section content>
```

The exact formatted embedding input is part of the chunk hash.

Each chunk has:

```json
{
  "chunkHash": "sha256:...",
  "source": ".agent/knowledge/authentication.md",
  "heading": "Refresh token rotation",
  "startLine": 42,
  "endLine": 68
}
```

## 8. Index Storage

The generated index is stored inside the repository:

```text
.agent/memory-index/
  snapshot.json
  vectors/
    sha256-abc123.f32
    sha256-def456.f32
```

Each vector is stored as a binary little-endian `Float32Array`.

The filename is derived from:

```text
hash(
  embedding profile +
  chunker version +
  normalized embedding input
)
```

The index must not use one mutable monolithic binary file.

Content-addressed vector files are required because they:

- avoid rewriting unchanged vectors;
- allow safe concurrent writes;
- can be committed to Git;
- allow identical embedding inputs to reuse the same embedding;
- keep vector storage independent of the active chunk list.

`snapshot.json` contains a schema version, preparation timestamp, project, embedding profile, document count, and the complete active chunk list. Each chunk stores its vector filename, chunk hash, source path, heading, line range, and normalized Markdown text. Stored text supports lexical ranking and snippets without reading source files.

Preparation publishes the snapshot atomically only after every referenced vector is complete and validated. A failed preparation leaves the previous snapshot usable; newly written, unreferenced vectors may be reused on the next preparation or removed by `gc`. The JSON snapshot is generated data and can be regenerated after a Git merge conflict.

Source paths, line ranges, headings, and snippets describe the last prepared content. They may be stale after Markdown edits, moves, or deletions until `prepare` runs again. Search does not inspect source files, timestamps, hashes, Git diffs, or branch changes to detect staleness.

## 9. Explicit Data Preparation

`iglo.mem prepare` performs incremental indexing as a finite, non-interactive command suitable for worktree setup scripts and periodic cron execution.

The synchronization process:

1. Scan the Markdown roots.
2. Normalize and chunk files.
3. Calculate chunk hashes.
4. Reuse valid vectors with the same embedding profile and input hash.
5. Batch missing chunks into embedding requests.
6. Write new vectors atomically.
7. Build a snapshot containing only chunks from this preparation's source scan, including their text and source metadata.
8. Atomically publish the completed snapshot and return a JSON summary.

If nothing changed, preparation performs zero document-embedding API calls. It may refresh source locations without re-embedding unchanged inputs. Deleted documents are removed from the next snapshot; unused vector files remain until `gc`.

If one section changed, only the chunks affected by that change are embedded again.

Embedding batches use a fixed batch size of 64 chunks.

Requests must be retried for:

- HTTP 429;
- HTTP 500–599;
- temporary network failures.

Retries use exponential backoff and respect `Retry-After` when available. Both preparation and query embedding use bounded retries and request timeouts, then return a JSON error and a nonzero exit code. Authentication, insufficient-credit, invalid-model, and invalid-input errors fail without retrying.

Preparation runs from the target worktree's working directory and exits after completion. An external scheduler supplies the working directory and runs as the user who completed credential setup, or supplies `OPENROUTER_API_KEY` as an override. Saved credentials work without loading shell startup files. The CLI does not create or manage the schedule. Outside credential setup, API credentials are required only when a command needs an embedding request.

## 10. Search Algorithm

The application exposes one search command:

```bash
iglo.mem search "natural language query"
```

The application internally performs:

1. Load and validate the prepared snapshot and all referenced vectors from the current worktree; fail if missing, corrupt, or incompatible.
2. Embed the query through OpenRouter using the snapshot's model and validate its dimensions.
3. Cosine similarity against the snapshot's active chunk vectors.
4. Exact phrase and token matching against chunk text.
5. Heading and filename matching.
6. Combined ranking.
7. Deduplication by source file.
8. Return of the top 8 results.

The user does not choose the ranking strategy.

Search performs no source discovery, freshness checks, document embedding, index writes, or automatic preparation. Its only remote operation is query embedding. A valid empty snapshot returns an empty result list without an API call. A missing or unusable index is an error, never an empty successful result or a partial search. Query embedding failure is an error; there is no lexical-only fallback.

Internal scoring combines semantic similarity with lexical bonuses:

```text
finalScore =
  cosineSimilarity * 0.80
  + exactPhraseBonus
  + tokenMatchBonus
  + headingMatchBonus
  + filenameMatchBonus
```

Bonus values are fixed constants in the implementation.

The search must favor exact identifiers and technical terms when they appear, while still finding semantically related content when wording differs.

No reranking LLM is used.

No second search tool is required.

## 11. Default Response Format

Every command returns JSON to stdout.

Human-readable setup prompts, progress, and diagnostics may be written to stderr. Stdout remains JSON even during interactive initialization; entered credentials are never echoed or included in output.

Successful search response:

```json
{
  "query": "How does authentication work?",
  "preparedAt": "2026-09-05T07:00:00Z",
  "results": [
    {
      "score": 0.87,
      "source": ".agent/knowledge/authentication.md",
      "heading": "Refresh token rotation",
      "startLine": 42,
      "endLine": 68,
      "snippet": "Refresh tokens are rotated after every successful refresh..."
    }
  ]
}
```

If no relevant result exists:

```json
{
  "query": "How does authentication work?",
  "preparedAt": "2026-09-05T07:00:00Z",
  "results": []
}
```

The output must never include full documents by default. The agent receives enough information to identify and read the source file itself.

`preparedAt` identifies the snapshot's preparation time; it is not a freshness check or a guarantee that source locations still match current files.

Errors return JSON to stdout and a nonzero exit code, for example:

```json
{
  "error": {
    "code": "INDEX_NOT_READY",
    "message": "No prepared index found. Run iglo.mem prepare in this worktree."
  }
}
```

Use stable error codes for a missing index (`INDEX_NOT_READY`), corrupt or incomplete index (`INDEX_INVALID`), incompatible profile or project (`INDEX_INCOMPATIBLE`), missing credentials (`API_KEY_MISSING`), invalid credential storage (`CREDENTIALS_INVALID`), credential-save failure (`CREDENTIALS_SAVE_FAILED`), canceled setup (`SETUP_CANCELLED`), embedding failure (`EMBEDDING_FAILED`), and lock contention (`INDEX_BUSY`). Missing, invalid, or incompatible index errors direct the caller to run `iglo.mem prepare`; none trigger automatic repair.

## 12. CLI Commands

Only the following commands exist:

```bash
iglo.mem init
iglo.mem prepare
iglo.mem search "<query>"
iglo.mem status
iglo.mem gc
```

### `iglo.mem init`

Creates:

```text
.agent/memory.json
.agent/knowledge/
.agent/decisions/
.agent/inbox/
.agent/memory-index/
```

Preserves existing repository configuration and source files, creates missing setup directories, and continues to credential setup even when `.agent/memory.json` already exists.

Credential setup:

1. Reuse an available environment or saved key without asking again. Report only its source (`environment` or `saved`), never its value. When using an environment key, explain that it has not been saved for other processes.
2. If no key exists and stdin and stderr are terminals, show where to create one (`https://openrouter.ai/settings/keys`) and explain the shared save location before asking `OpenRouter API key:`. Hide all entered characters, trim surrounding whitespace, and reject empty input.
3. Save the entered key with the permissions and atomic-write requirements in section 5. Report success only after saving succeeds; a write failure returns `CREDENTIALS_SAVE_FAILED`. Cancellation or end-of-input returns `SETUP_CANCELLED` without writing credentials. Always restore terminal echo after success, failure, or cancellation.
4. Without an interactive terminal, never prompt or wait for input. Reuse existing credentials or return `API_KEY_MISSING` with instructions to run `iglo.mem init` interactively or supply `OPENROUTER_API_KEY`.

`iglo.mem init --reset-credentials` explicitly prompts for and replaces the saved key, even when one already exists or an environment override is set. It requires an interactive terminal and preserves the previous saved key if canceled or saving fails. Explain that an environment override still takes precedence for subsequent commands.

Initialization makes no API calls; successful setup means a credential is available, not that OpenRouter has accepted it. Authentication failures during later API requests direct users to check the environment override or rerun `iglo.mem init --reset-credentials`. No other command prompts for replacement credentials. Partial repository setup is safe to rerun after a credential error.

Initialization does not scan sources or generate a searchable snapshot. Run `iglo.mem prepare` before the first search.

### `iglo.mem prepare`

Scans sources, reuses valid embeddings, generates missing embeddings through OpenRouter, and publishes the searchable snapshot. Repeated runs are safe, and failed runs preserve the last successful snapshot. Missing or corrupt derived data is rebuilt from Markdown by this command.

Returns a JSON summary, for example:

```json
{
  "project": "example-project",
  "preparedAt": "2026-09-05T07:00:00Z",
  "documents": 42,
  "chunks": 318,
  "reusedVectors": 311,
  "embeddedVectors": 7
}
```

### `iglo.mem search "<query>"`

The agent-facing search command. It validates the prepared index, embeds only the query, searches stored chunks, ranks, and returns JSON. It searches the last successfully prepared data regardless of subsequent source changes, or fails clearly if that data cannot be searched.

### `iglo.mem status`

Reports the prepared snapshot and referenced vector availability without scanning Markdown, calling the API, or changing the index. It does not report source freshness. Returns JSON containing:

```json
{
  "project": "example-project",
  "preparedAt": "2026-09-05T07:00:00Z",
  "documents": 42,
  "chunks": 318,
  "vectors": 311,
  "missingVectors": 7,
  "profile": "sha256:<hash-of-profile-settings>"
}
```

### `iglo.mem gc`

Removes vector files that are no longer referenced by the published snapshot. It does not scan current Markdown to decide what to delete: source changes alone must not invalidate the prepared index. A missing or invalid snapshot causes an error without deleting anything.

The command must coordinate with indexing and search through a lock so cleanup cannot remove vectors another active process needs.

## 13. Multiple Worktrees

The current worktree is determined from the process working directory.

The application must:

- resolve the current Git repository root;
- read `.agent/memory.json` from that worktree;
- scan only that worktree's Markdown files during preparation;
- never search sibling worktrees automatically;
- load one complete snapshot from that worktree, without combining it with another worktree's data;
- treat the vector cache as content-addressed and reusable.

Each worktree owns its snapshot and vector files. Run `iglo.mem prepare` after creating a worktree or switching branches to align the snapshot with its sources; a valid committed snapshot can also be searched as-is. Search does not verify branch freshness. New or modified Markdown creates new content-addressed vector files only during preparation.

Concurrent processes must not corrupt the index.

Use a worktree-local lock to coordinate preparation, snapshot/vector loading, and garbage collection. Preparation holds the lock through publication; search can release it after loading the complete snapshot and its vectors. Lock acquisition has a bounded wait and returns `INDEX_BUSY` on contention, making overlapping cron runs safe. Separate worktrees do not share a lock.

Vector writes use:

1. temporary file;
2. complete binary write;
3. dimension validation;
4. atomic publication at the final path.

Separate worktrees may generate identical vectors independently; duplicate API calls are acceptable. Corrupted or partially written vectors are not.

## 14. Security and Privacy

The application must:

- read API keys only from the environment or the shared user-level credentials file; accept hidden terminal entry only during explicit initialization;
- save credentials only outside repositories, with owner-only permissions and atomic writes;
- never accept API keys as command-line argument values or copy environment keys into files automatically;
- never write API keys to `.agent/memory.json`;
- never print API keys;
- never include API keys in error messages;
- send only files from the defined source directories;
- exclude `.env`, secrets, dependencies, build output, and the index itself;
- avoid logging full document contents;
- use HTTPS by default;
- fail clearly if the API key is missing when an embedding request is needed.

OpenRouter and its serving provider receive document chunks during preparation and queries during search. This must be clearly documented.

## 15. Technology

Implementation:

- Bun;
- TypeScript;
- built-in `fetch`;
- Bun filesystem APIs;
- Bun crypto APIs;
- `Float32Array`;
- no runtime database;
- no runtime daemon;
- no local ML model;
- no mandatory third-party executable.

The application may use npm packages at build time, but the final executable must contain all required runtime code.

Build command:

```bash
bun build --compile src/cli.ts --outfile dist/iglo.mem
```

The resulting executable must run without requiring the user to install Bun, Node.js, or project dependencies.

## 16. Performance Requirements

For a repository containing up to 10,000 active chunks:

- source scanning during preparation must not require an API call;
- unchanged inputs during preparation must generate zero document-embedding requests;
- search must perform zero Markdown source reads and zero document-embedding requests, including when files have changed;
- vector search must complete in under one second excluding query embedding latency;
- document embeddings must be requested in batches;
- only active vectors may be loaded into the search set;
- the application must not load any local language model;
- search must not start a persistent process.

The implementation uses a linear cosine scan for this scope.

## 17. Acceptance Criteria

### Installation

- A user can download one executable.
- The user does not need Bun, Node.js, npm, or any package manager.
- The executable runs from any repository containing `.agent/memory.json`.

### Configuration

- Both document and query embeddings use `https://openrouter.ai/api/v1/embeddings` with bearer authentication from the environment override or shared credentials file.
- The default model is `openai/text-embedding-3-small`; another OpenRouter embedding model ID can be configured.
- Response vectors are matched by input index and validated before use.

### Credential setup and reuse

- First interactive `init` with no credential prompts with hidden input and saves the key outside the repository with owner-only permissions.
- Later initialization in another repository or worktree reuses the saved key without prompting or copying it.
- Rerunning `init` in an initialized repository can complete missing credential setup without overwriting project configuration.
- `OPENROUTER_API_KEY` overrides the saved key without changing the file.
- Cron under the same OS user can prepare data using saved credentials without shell startup files.
- Non-interactive initialization without credentials fails promptly with JSON and a nonzero exit code. Preparation and search never prompt.
- Cancellation and failed credential writes do not leave partial credentials or overwrite the previous saved key; terminal echo is restored.
- Explicit credential reset replaces the saved key without affecting repository configuration, snapshots, or vectors.
- Malformed or insecure saved credentials produce actionable errors, and no key appears in stdout, stderr, logs, repository files, or command arguments.

### Incremental behavior

- First preparation indexes and embeds all missing chunks.
- Repeating preparation without input changes performs no document-embedding calls.
- Editing one Markdown section embeds only the affected chunks on the next preparation.
- Deleted chunks disappear only after successful preparation.
- Preparation can run non-interactively from worktree setup or cron, exits with JSON, and has bounded retries and lock waits.
- Failed preparation preserves the previous complete snapshot.
- Changing the embedding profile prevents reuse or comparison of incompatible vectors.

### Worktrees

- Two agents can search simultaneously in separate worktrees.
- Results are limited to the current worktree.
- Worktree creation or branch switching does not trigger automatic preparation during search.
- Concurrent writes cannot create corrupt vector files.
- Identical embedding inputs under the same profile produce identical vector filenames.

### Search

- One natural-language query is sufficient.
- The result contains source path, heading, line range, score, and snippet.
- Exact technical terms receive a ranking bonus.
- Semantic matches work when the query wording differs from the source wording.
- The output is always valid JSON.
- Search before preparation returns `INDEX_NOT_READY` and exits nonzero without scanning sources or embedding documents.
- Editing, adding, moving, or deleting Markdown after preparation leaves search results and stored locations unchanged until the next successful preparation.
- Search succeeds from a valid snapshot even if source Markdown cannot be read.
- Missing or corrupt referenced vectors and incompatible settings produce explicit errors without repairs or partial results.
- Query embedding failures produce explicit errors without a ranking fallback.
- A successfully prepared empty source set returns an empty result list without calling OpenRouter.
- Search includes the snapshot's preparation timestamp and leaves index data unchanged.

### Repository storage

- Markdown remains readable and editable by humans.
- Embeddings are stored inside `.agent/memory-index/`.
- Removing the index makes search fail; running `iglo.mem prepare` rebuilds it from Markdown.
- Garbage collection preserves all vectors referenced by the published snapshot, including when Markdown has since changed or been deleted.
- No external vector database is required.

## 18. Definition of Done

The project is complete when:

1. `iglo.mem init` creates a usable repository configuration and guides first-time credential setup, saving the key for reuse across worktrees.
2. `iglo.mem search "<query>"` works as the only agent-facing search workflow.
3. Document and query embeddings are generated through OpenRouter's embeddings API.
4. Embeddings are persisted as content-addressed binary files.
5. `iglo.mem prepare` performs incremental indexing explicitly and can be run during worktree setup or from cron.
6. Search returns ranked results with Markdown source locations and text from the last prepared snapshot, without source scanning or index mutation.
7. Multiple Git worktrees remain isolated.
8. The executable runs without runtime installation.
9. The API key never enters the repository and shared credentials are stored with owner-only permissions.
10. The full behavior is covered by automated tests, including credential setup/reuse/reset, environment precedence, non-interactive operation, secret redaction, API failures, explicit preparation, search without source access, missing/corrupt indexes, changed and deleted files, profile changes, failed preparation, and concurrent preparation/search/garbage collection.
