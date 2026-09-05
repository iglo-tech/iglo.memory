# Product verification after containment fix

Risk: HIGH (credential destination).
Status: VERIFIED for changed Linux behavior; full delivery remains partial.
Snapshot: accompanying fix commit, pinned by the second independent review.

Reproduction: containment-before.txt records the new nested-dotfiles-repository
regression failing on 002cc56. Code now walks from the actual credential
directory to the filesystem root before reads/saves, including missing path
components. It still trusts same-user processes; no adversarial framework added.

Scenario: ordinary Git directories/gitfiles rooted at ~/.config and
~/.config/iglo.mem reject reads and saves. The real CLI returns
CREDENTIALS_INVALID. Independent reads show prior bytes unchanged; environment
override remains usable without saved-file reads. Normal shared setup/reset,
PTY cancellation/echo restoration and standalone CLI journeys still pass.

Checks: sh scripts/check.sh => PASS (checks-round2.txt, tests plus strict types).
sh scripts/build.sh => PASS. python3 scripts/qa-terminal.py => PASS
(terminal-round2.json). python3 scripts/qa-clean.py => PASS
(clean-machine-round2.json, five commands, no runtimes/network/source addon).

Gates: regression=PASS; CLI=PASS; PTY=PASS; clean-Linux-executable=PASS;
module/types=PASS. GUI=SKIPPED (terminal product). Live API and other targets
remain NOT_RUN for the same explicit reasons in verify.md. Snapshot/ranking/
transport code unchanged from prior verified revision; prior evidence retained.
Cleanup: all dummy homes/repos/PTYs/containers removed by test finally blocks.
Quality: implemented Linux flows PASS; full scope PARTIAL pending external proof.
Next: independent review of the fixed cumulative diff; preserve round-1 findings.
