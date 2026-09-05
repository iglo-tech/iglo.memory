# iglo.mem

Repository-local semantic search for Markdown. Prepare a snapshot when your
knowledge changes, then search it from an agent or a terminal.

```sh
iglo.mem init
iglo.mem prepare
iglo.mem search "How do refresh tokens work?"
iglo.mem status
iglo.mem gc
```

Run commands from anywhere inside the target Git worktree. Every command emits
one JSON object to stdout; prompts and progress use stderr. Errors exit with
status 1. Initialization preserves existing configuration and Markdown.

## Credentials

Run `iglo.mem init` in a terminal. If no key is available, it asks for an
OpenRouter key with input hidden and saves it to
`~/.config/iglo.mem/credentials.json`. Create a key at
<https://openrouter.ai/settings/keys>.

This is one plaintext file shared by your repositories and worktrees. Its
permissions are private to your OS user. The key is never copied into the
repository. Cancellation or a failed save preserves the previous key.

`OPENROUTER_API_KEY` overrides the saved key without changing it. Use
`iglo.mem init --reset-credentials` to replace the saved key interactively.
The tool trusts other processes running as your OS user; it is not a secret
vault. Keep your home and credentials directory outside Git repositories.

Prepare and search never prompt. They need a key only when making an embedding
request. Empty prepared snapshots can be searched without a key or network.
Initialization does not test the key against OpenRouter.

## Sources and freshness

Only `.agent/knowledge/**/*.md` and `.agent/decisions/**/*.md` are indexed.
`.agent/inbox`, dependencies, build output, dotenv files and the index are
excluded. Source symlinks are rejected. Markdown is never modified.

Every file uses the same Markdown heading and paragraph/code-block processing.
Complete blocks are grouped toward a soft size target for focused search
results. There is no local file/chunk length rejection or truncation; long
indivisible blocks stay intact. Provider input limits still apply. If a provider
rejects an input, preparation fails and the prior snapshot remains available.

`prepare` sends missing or changed inputs to OpenRouter, in batches of up to 64.
Unchanged valid vectors are reused. The published snapshot lives at
`.agent/memory-index/snapshot.json`, with individual binary float32 vectors in
`vectors/`. Compatible valid orphans from failed preparation can be reused;
`gc` removes recognized artifacts not referenced by the current snapshot.

`search` embeds only the query and reads prepared data. It does not read Markdown,
check freshness, refresh, or repair the index. Results contain up to eight files,
ranked by cosine similarity plus fixed lexical bonuses, with headings, source
line ranges, scores, snippets and a preparation timestamp. Locations describe
the prepared content and can be stale. Search can continue after source files
are removed or made unreadable. Query failure is an error, never a lexical fallback.

Run `prepare` after edits or when a new worktree needs a fresh snapshot. A valid
committed snapshot can also be searched as-is. Each worktree has its own index.
Concurrent preparation, loading and GC coordinate with a five-second lock wait;
a stopped process releases its lock through the OS.

`status` reports prepared counts and missing referenced vectors without reading
sources or calling OpenRouter. Corrupt present data is an error. `gc` requires
valid metadata and all referenced vectors before deleting anything. It does not
use Markdown changes to decide which vectors to keep.

## Configuration and recovery

`init` creates `.agent/memory.json`:

```json
{
  "project": "your-repository",
  "embedding": { "model": "openai/text-embedding-3-small" }
}
```

Only the OpenRouter embedding model is configurable; the endpoint and source
roots are fixed. Changing model, project or chunking/profile rules requires
`prepare` again. Rotating the key does not require re-embedding.

- `INDEX_NOT_READY`, `INDEX_INVALID`, `INDEX_INCOMPATIBLE`: run `prepare`.
- `API_KEY_MISSING`: run interactive `init` or supply the environment override.
- `CREDENTIALS_INVALID`: repair the saved file/path/permissions, or use an override.
- `EMBEDDING_FAILED`: check the override/saved key, model, input limits and network.
- `INDEX_BUSY`: retry when the other command finishes.

A failed refresh does not publish partial results. API retries cover temporary
network failures, HTTP 429 and 5xx, honor Retry-After, and are bounded to four
attempts and a two-minute request budget. Permanent errors do not retry.

OpenRouter and its serving provider receive document chunks during preparation
and query text during search. Do not put secrets in the indexed Markdown.
The tool does not install schedules, hooks, watchers, or background services.
For cron, configure your own working directory and use the saved key:

```cron
0 * * * * cd /absolute/path/to/worktree && /absolute/path/to/iglo.mem prepare
```

## Build and verification

Current executable verification target: Linux x86_64. Other platforms remain
unverified; no downloadable release has been published by this development PR.
The native build needs a C compiler and Node-API headers; these are build-time
requirements. The executable embeds Bun and the small OS-lock binding. It does
not require Bun, Node.js, npm, Git or a lock executable at runtime. It still needs
the target OS C runtime. A missing Git executable does not prevent worktree discovery.

```sh
npm exec --yes --package=bun@1.4.2 -- bun install --frozen-lockfile
sh scripts/check.sh
sh scripts/build.sh
python3 scripts/qa-terminal.py
```

On Linux the default header location is `/usr/include/node`; override
`NODE_INCLUDE_DIR` if needed. Run the resulting `dist/iglo.mem` from your worktree.
For source development use the absolute path to `scripts/run.sh`. The supported
launcher and compiled build disable repository dotenv and Bun preload loading.
Do not use bare `bun src/cli.ts` from an untrusted repository.

Tests use disposable repositories, homes and dummy credentials. API contract
and ranking fixtures are deterministic mocks; they do not establish live-provider
relevance. See `.ai/work/iglo-mem/evidence/` for measured verification and remaining
release/platform/quality work.
