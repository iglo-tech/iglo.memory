# Final product verification

Status: VERIFIED locally on Linux x86_64; CI artifact verification pending.
Snapshot: accompanying credential-race fix commit; earlier production source f061341 unchanged except credentials.ts validation.

Live OpenRouter: live-openrouter.json proves compiled document embedding (3 inputs), unchanged preparation (0 new inputs), semantic paraphrase and exact-term query ranking (2 queries), saved-key use without environment/shell setup, unreadable-source search, status/GC and unchanged credentials/source/snapshot. No more live calls required for the isolated credential stat fix.

CI at ef01ed9 failed concurrent credential saves. Reproduction concurrent-save-before.json: 4 processes, 12,000 saves, lstat saw displaced ordinary 0600 file inodes with nlink=0. Atomic rename unlinks an old inode normally. Reject multiple hardlinks (>1), accept zero-link stat results; no credential lock or relaxed permissions. concurrent-save-after.json: same 12,000 saves, zero errors. Regression test now makes 2,000 concurrent saves; separate test retains hardlink rejection and bytes preservation.

sh scripts/check.sh: PASS, 35 tests, 292 assertions, strict TypeScript (checks-ci-fix.txt).
sh scripts/build.sh: PASS; python3 scripts/qa-terminal.py: PASS (terminal-ci-fix.json).
python3 scripts/qa-clean.py: PASS (clean-ci-fix.json), compiled executable alone in clean Debian, all five commands, no runtime/Git/network.
npx --yes bun@1.4.2 --no-env-file --config=/dev/null scripts/qa-cli.ts: PASS (cli-ci-fix.json), controlled provider full command flow including failure preservation.
New committed-snapshot linked-worktree/concurrent search/long snippet test passes in the suite. Full output remains bounded to 400 codepoints plus ellipsis; input acceptance has no hard length limit.

Retained current evidence: verify.md, verify-round2.md, verify-round3.md; all raw CLI, terminal, concurrency, integrity and benchmark artifacts. performance-summary.json records 100 warm and 20 OS-eviction-requested cold runs per dimension (10,000 chunks, 1536/3072); max 524/629ms. Ranking/vector code unchanged; remote latency excluded. Other OS/CPU ports are unverified future work under accepted-amendments.md (PRD has no OS matrix).

Pending: real GitHub checks, download its Linux executable artifact and run clean-container verification; independent final reviews. No merge requested. Fixture homes/repos/containers cleaned. User-created untracked .agent remains untouched.
