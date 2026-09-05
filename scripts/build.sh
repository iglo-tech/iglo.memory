#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
config=$(mktemp /tmp/iglo-bun-config-XXXXXX.toml)
trap 'rm -f "$config"' EXIT HUP INT TERM
cd "$root"
sh scripts/native.sh
npx --yes bun@1.4.2 --no-env-file --no-install --config="$config" build --compile --no-compile-autoload-dotenv --no-compile-autoload-bunfig src/cli.ts --outfile dist/iglo.mem
