#!/usr/bin/env bash

set -e

BASE_URL=${1:-https://sa21.up.railway.app}

echo "🔎 Checking provider status at: $BASE_URL/api/providers/status"
echo
if command -v jq >/dev/null 2>&1; then
  curl -s "$BASE_URL/api/providers/status" | jq .
else
  echo "(tip) Install jq for pretty output: brew install jq" >&2
  curl -s "$BASE_URL/api/providers/status"
fi

echo
echo "Legend: true = configured, false = missing"

