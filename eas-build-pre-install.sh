#!/usr/bin/env bash
set -euo pipefail
echo "=== PRE-INSTALL DIAGNOSE ==="
node -v || true
yarn -v || true
yarn config get nodeLinker || true
yarn config get yarnPath || true
ls -la
echo "=== SHOW yarn.lock checksum ==="
(sha256sum yarn.lock || shasum -a 256 yarn.lock || true) 2>/dev/null
echo "=== END DIAGNOSE ==="
