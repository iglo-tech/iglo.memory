#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
config=$(mktemp /tmp/iglo-bun-config-XXXXXX.toml)
trap 'rm -f "$config"' EXIT HUP INT TERM
npx --yes bun@1.4.2 --no-env-file --no-install --config="$config" "$root/src/cli.ts" "$@"
