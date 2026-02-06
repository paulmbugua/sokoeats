#!/usr/bin/env bash
set -euo pipefail

echo "Node: $(node -v)"
echo "Yarn: $(yarn -v)"
echo "nodeLinker: $(yarn config get nodeLinker || true)"
echo "yarnPath: $(yarn config get yarnPath || true)"
echo "nmHoistingLimits: $(yarn config get nmHoistingLimits || true)"
echo "PWD: $(pwd)"
echo "Top-level files:"
ls -la | sed -n '1,80p'
