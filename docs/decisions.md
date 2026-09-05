# Design decisions

These accepted decisions explain the implementation and supersede conflicting
chunk-size and overlap rules in the original [PRD](../PRD.md). Operating commands
and configuration are documented in the [README](../README.md).

## Shared credentials without a secret-management service

Users need to configure one key and reuse it across repositories and worktrees.
Store it in `~/.config/iglo.mem/credentials.json`, outside Git repositories, with
0700 directory and 0600 file permissions. `OPENROUTER_API_KEY` takes precedence;
interactive init/reset hides input. Save through a private temporary file and
atomic replacement, preserving the previous value if saving fails.

Trust other processes running as the same OS user. Static ownership, symlink,
hardlink and repository-containment checks catch ordinary unsafe locations;
this is not a vault or an adversarial same-user relocation defense. Concurrent
successful saves use last-commit-wins semantics without a credential lock.
An inode observed during atomic replacement may already have zero links;
that does not mean the file was an unsafe hardlink.

## One Markdown pipeline without hard input limits

Use the same heading/paragraph/code-block processing for every file. Group
complete blocks toward a soft 5,000-code-point target and retain an indivisible
oversized block intact. Do not reject inputs by length, truncate them, classify
files by size or enforce fixed overlap. This replaces the original PRD's hard
5,000-character maximum and exact 500-character overlap, which conflict with
preserving arbitrary complete blocks and the owner's requested behavior.

Headings accompany embedding inputs and results. The chunker identity is
`markdown-blocks-v1`. Provider limits can still reject an input; preparation
then fails without replacing the prior snapshot. Changing chunking changes
embedding inputs and requires preparation again.

## Explicit snapshots and worktree-local coordination

Preparation owns source scanning, change detection and document embedding.
Search owns one query embedding and ranking over the last published snapshot.
It never checks source freshness, repairs data or falls back to lexical search
when embedding fails. This keeps agent search predictable and allows it to work
when source Markdown has changed or cannot be read.

Each worktree owns its index. Preparation, snapshot loading, status and GC use
a bounded exclusive OS lock on the worktree directory. A small embedded Node-API
binding supplies POSIX flock; closing the descriptor or process exit releases
ownership. There is no stale-PID lockfile recovery or age-based lock theft.
Search releases the lock after loading all required data, before its API call.
GC uses published references, not current Markdown, as deletion authority.

Validated vector files and receipts are written before atomic snapshot
replacement, which is the publication point. Compatible receipts permit orphan
reuse after an interrupted preparation. Canonical profiles include model,
endpoint, dimensions and input-format/chunker/normalization identities; credentials
do not affect cache identity. Snapshot byte digests catch accidental vector
mismatches. These checks do not claim protection from malicious replacement of
both snapshot and vectors, or guaranteed power-loss/network-filesystem durability.

## Ranking, binary loading and runtime scope

Ranking uses cosine similarity weighted 0.80, plus exact phrase 0.10,
text-token 0.06, heading-token 0.03 and filename-token 0.01 bonuses. The minimum
score is 0.25. Stable source/line/hash ties and file deduplication precede the
top-eight limit. Snippets contain at most 400 code points plus an ellipsis;
this bounds output, not accepted document length. There is no full-document
retrieval mode; a short passage may fit entirely within an excerpt.

Keep validated little-endian float32 bytes as typed-array views where alignment
and host byte order allow, with explicit decoding otherwise. Avoid expanding
all vectors into boxed numbers: measured full-CLI runs at 10,000 chunks and
3,072 dimensions exceeded one second before this change. See the
[verification guide](verification.md) for the measurement method and limits.

Linux x86_64 is the supported build. The executable embeds Bun and the lock
binding and requires the target OS C runtime, but no separately installed
Bun, Node, npm or Git. Other OS/CPU ports need their own native-lock, terminal
and clean-machine proof before support is advertised. Builds and the supported
source launcher disable repository dotenv and Bun configuration/preload loading.

## Bun APIs and imports

Use Bun's native APIs for hashing, ordinary script file I/O and subprocesses;
use global crypto for UUID generation. Keep the OS filesystem operations needed
for permissions, directories, exclusive creation, validated synchronous reads
and atomic rename. Removing those operations just to eliminate `node:` imports
would change the file-safety and publication guarantees. Path and OS utilities
also use Bun's supported `node:path` and `node:os` implementations.

All project module imports use `@/` mapped to the repository root. Oxlint checks
the rule and oxfmt keeps layout consistent. Builtins and packages retain their
normal names. The sole `require` exception is `@/dist/lock.node`, because Bun
requires `require()` to load Node-API addons; the alias remains statically
resolvable and the compiled executable embeds the addon.
