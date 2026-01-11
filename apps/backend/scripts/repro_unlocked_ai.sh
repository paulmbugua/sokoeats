#!/usr/bin/env bash
set -euo pipefail

: "${BACKEND_URL:=http://localhost:3000}"
: "${TOKEN:?Set TOKEN to a valid JWT}"
: "${COURSE_ID:?Set COURSE_ID to a UUID course id}"

echo "Unlocking AI course..."
curl -sS -X POST "${BACKEND_URL}/api/certificates/unlock" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"courseId\":\"${COURSE_ID}\"}" | jq .

echo "Fetching unlocked AI courses..."
resp="$(curl -sS "${BACKEND_URL}/api/courses/mine/unlocked-ai" \
  -H "Authorization: Bearer ${TOKEN}")"

echo "${resp}" | jq .

items_len="$(echo "${resp}" | jq '.items | length')"
if [[ "${items_len}" -lt 1 ]]; then
  echo "Expected at least 1 unlocked AI course, got ${items_len}" >&2
  exit 1
fi

echo "✅ unlocked-ai returns ${items_len} items"
