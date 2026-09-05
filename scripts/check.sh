#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
config=$(mktemp /tmp/iglo-bun-config-XXXXXX.toml)
trap 'rm -f "$config"' EXIT HUP INT TERM
cd "$root"
sh scripts/native.sh
node_modules/.bin/oxlint --deny-warnings src test scripts
node_modules/.bin/oxfmt --check .
# The equals form matters: --config PATH does not apply the intended isolation.
npx --yes bun@1.4.2 --no-env-file --no-install --config="$config" test
npx --yes bun@1.4.2 --no-env-file --no-install --config="$config" node_modules/typescript/bin/tsc --project tsconfig.json
