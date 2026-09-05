# Final product verification

Status: VERIFIED on Linux x86_64, including live API and downloaded CI executable.
Snapshot: accompanying credential-race fix commit; earlier production source f061341 unchanged except credentials.ts validation.

Live OpenRouter: live-openrouter.json proves compiled document embedding (3 inputs), unchanged preparation (0 new inputs), semantic paraphrase and exact-term query ranking (2 queries), saved-key use without environment/shell setup, unreadable-source search, status/GC and unchanged credentials/source/snapshot. No more live calls required for the isolated credential stat fix.

CI at ef01ed9 failed concurrent credential saves. Reproduction concurrent-save-before.json: 4 processes, 12,000 saves, lstat saw displaced ordinary 0600 file inodes with nlink=0. Atomic rename unlinks an old inode normally. Reject multiple hardlinks (>1), accept zero-link stat results; no credential lock or relaxed permissions. concurrent-save-after.json: same 12,000 saves, zero errors. Regression test now makes 2,000 concurrent saves; separate test retains hardlink rejection and bytes preservation.

sh scripts/check.sh: PASS, 35 tests, 292 assertions, strict TypeScript (checks-ci-fix.txt).
sh scripts/build.sh: PASS; python3 scripts/qa-terminal.py: PASS (terminal-ci-fix.json).
python3 scripts/qa-clean.py: PASS (clean-ci-fix.json), compiled executable alone in clean Debian, all five commands, no runtime/Git/network.
npx --yes bun@1.4.2 --no-env-file --config=/dev/null scripts/qa-cli.ts: PASS (cli-ci-fix.json), controlled provider full command flow including failure preservation.
New committed-snapshot linked-worktree/concurrent search/long snippet test passes in the suite. Full output remains bounded to 400 codepoints plus ellipsis; input acceptance has no hard length limit.

Retained current evidence: verify.md, verify-round2.md, verify-round3.md; all raw CLI, terminal, concurrency, integrity and benchmark artifacts. performance-summary.json records 100 warm and 20 OS-eviction-requested cold runs per dimension (10,000 chunks, 1536/3072); max 524/629ms. Ranking/vector code unchanged; remote latency excluded. Other OS/CPU ports are unverified future work under accepted-amendments.md (PRD has no OS matrix).

Final independent reviews: all three PASS (review-final.md); 294-row coverage audit complete. Finish must recheck provider state after final metadata push. No merge requested. Fixture homes/repos/containers cleaned. User-created untracked .agent remains untouched.

CI follow-up: at 3a521ae, run33963961228 passed tests/build/PTY but clean QA failed. Standard and Ponytail found the harness hardcoded UID1000 for a private fixture owned by the invoking user. qa-clean.py now uses os.getuid()/getgid() and surfaces both JSON stdout and stderr on failure. Local clean container rerun PASS; hosted-runner verification follows. Production binary is unchanged by this harness correction.

Final hosted proof at 0b9d8770aa2251cdb6edf28b4ebbc958f79fa41e: GitHub runs 33964026774 (push) and 33964028645 (PR) both SUCCESS, including 35 tests/types, compile, PTY and clean-container QA, packaging/upload. Downloaded artifact9968846191 from run33964026774; archive SHA256 matches GitHub digest; single executable mode0755, binary SHA25685daf3ab0c27af555831ba98cc527f86d878b28613f9ef2934bca5511c88d76d. All five commands pass from this downloaded binary in the pinned clean Debian container with no runtimes/Git/network. See downloaded-artifact.json. Artifact fixtures removed. This resolves the UID harness finding and downloadable-installation proof.
