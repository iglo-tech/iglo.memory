#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p dist
case "$(uname -s)" in
  Linux) cc -shared -fPIC -O2 -Wall -Wextra -Werror -DNAPI_VERSION=8 -I"${NODE_INCLUDE_DIR:-/usr/include/node}" native/lock.c -o dist/lock.node ;;
  Darwin) cc -bundle -undefined dynamic_lookup -O2 -Wall -Wextra -Werror -DNAPI_VERSION=8 -I"${NODE_INCLUDE_DIR:-/usr/local/include/node}" native/lock.c -o dist/lock.node ;;
  *) echo 'This build needs a POSIX flock implementation.' >&2; exit 1 ;;
esac
