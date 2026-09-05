# D03 feasibility — 2026-09-05

Status: BLOCKED. Partial experiment; no production primitive selected.
Linux x86_64, filesystem `ext2/ext3` per stat; Bun 1.4.2 (744846f84), system cc,
Node-API v8 headers. A disposable C addon exposed directory open, nonblocking
flock, close and dummy openat/write/renameat. ldd: libc.so.6 and Linux loader.

Commands in `/tmp/iglo-d03-iepAaZ` (all exited 0):

```sh
cc -shared -fPIC -DNAPI_VERSION=8 -I/usr/include/node probe.c -o probe.node
npx --yes bun@1.4.2 build --compile --no-compile-autoload-dotenv --no-compile-autoload-bunfig probe.ts --outfile probe
python3 run.py
python3 startup.py
```

Harness success includes reproducing the expected G05 failure. The addon file
was renamed away before compiled execution with PATH=/nonexistent. Embedding
worked; this is not clean-machine release proof. [Raw events](events.json).

- G01 partial: independent processes contended; bounded wait failed at 5,003 ms.
  Full critical-region overlap instrumentation remains pending.
- G02 partial: data replacement did not release the directory lock; killing a
  holder let a waiter acquire; canceling a waiter did not prevent later entry.
- G03 partial: another directory acquired immediately without new entries.
  Real committed-snapshot linked-worktree case remains pending.
- G04 not run: no complete credential transaction/fault suite exists.
- G05 FAIL: the harness moved an opened owner-only directory into a worktree,
  replacing its old path with a symlink. openat/renameat wrote the dummy key in
  the relocated directory, mode 0600. The symlink target remained untouched.

Second approach: fstat(fd) matched stat(originalPath) immediately before write;
an adversarial rename between validation and openat still put dummy bytes into
the worktree. This disproves these approaches, not every privileged design.
Same-user threat scope needs a decision; agreed protection remains unchanged.

Repeatable G05 reproduction with dummy bytes only:

```python
import os, pathlib, tempfile, subprocess
with tempfile.TemporaryDirectory(dir='/tmp') as t:
    p = pathlib.Path(t)
    safe = p/'safe'; safe.mkdir(mode=0o700)
    repo = p/'repo'
    subprocess.run(['git', 'init', '--quiet', str(repo)], check=True)
    fd = os.open(safe, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    assert os.fstat(fd).st_ino == safe.stat().st_ino
    safe.rename(repo/'moved')  # adversary after last validation
    f = os.open('dummy', os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW,
                0o600, dir_fd=fd)
    os.write(f, b'DUMMY'); os.close(f); os.close(fd)
    assert (repo/'moved'/'dummy').read_bytes() == b'DUMMY'
```

Startup: [results](startup.json). Dummy dotenv/preload fixtures covered cwd,
repo, ancestor and fake global home. Entry reported only environment-key
presence, not credential resolution. Source used absolute pinned Bun with
`--no-env-file --no-install --config=<trusted empty file> <absolute entry>`.
Both source and compiled entry ignored dummy keys/preloads. The first attempt
used `--config <path>` and unexpectedly executed preload instead of the entry;
the equals form fixed it. An isolated-home alternative was not needed/adopted.
I12 saved-key/environment-override product flows remain pending.

Primary references: [Bun embedded addons](https://bun.sh/docs/bundler/executables),
[openat stable references](https://www.man7.org/linux/man-pages/man2/open.2.html).
Containment conclusion is an inference supported by the reproduced rename.

SHA-256: C source `beb1f3afd6a8258c4aa16c3d130552ee1ff596803f5dbc8d7c6e7d590336a253`;
TS source `d5f5a75d0f57955a9a75ede998b5b638e2a716427bc518b8b2a0e43465b2e547`;
binary `bb0e8e792dfc79b871eec23605b0b60fa4b4c53be57b8e19057be06a3461c13e`.
Disposable sources/binaries/fixtures removed; no real credentials/API used.

Follow-up repeated G05 with an actual git-init repository; git rev-parse confirmed
inside-work-tree=true. Validation-before-rename still wrote dummy bytes inside
the worktree. Exit 0 reproduces the failure; fixtures removed. Git was only used
by the fixture harness, not the proposed runtime primitive.
