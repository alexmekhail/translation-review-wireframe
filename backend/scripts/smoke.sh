#!/usr/bin/env bash
# Exercises a RUNNING backend over real HTTP (not in-process inject).
# Usage: API=http://127.0.0.1:3000/api/v1 ./scripts/smoke.sh
# Needs: curl, python3. Uses the simulated dev tokens (dev-alex, dev-sam).
set -euo pipefail
cd "$(dirname "$0")/.."
B=${API:-http://127.0.0.1:3000/api/v1}
A='Authorization: Bearer dev-alex'
S='Authorization: Bearer dev-sam'
json() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
expect() { [ "$1" = "$2" ] && echo "  ok: $3 ($1)" || { echo "  FAIL: $3: expected $2, got $1"; exit 1; }; }

echo "health:"; expect "$(curl -s $B/health | json 'd["status"]')" ok "health endpoint answers (startup only)"

echo "create (R1):"
ID=$(curl -s -H "$A" -F file=@test/fixtures/merchant.txt -F title="Smoke: The Merchant" $B/books | json 'd["id"]')
echo "  book $ID"

echo "read until drafts are ready (R4):"
for _ in $(seq 1 20); do
  STATUS=$(curl -s -H "$A" $B/books/$ID | json 'd["pipeline_status"]'); [ "$STATUS" = ready ] && break; sleep 0.25
done
expect "$STATUS" ready "pipeline finished"
expect "$(curl -s -H "$A" $B/books/$ID | json '[p["position"] for p in d["paragraphs"]]')" "[1, 2, 3, 4, 5]" "paragraphs in reading order"
P1=$(curl -s -H "$A" $B/books/$ID | json 'd["paragraphs"][0]["id"]')

echo "update a correction (R6), then read it back:"
expect "$(curl -s -X PATCH -H "$A" -H 'content-type: application/json' \
  -d '{"base_version":0,"text_en":"Long ago, there was a merchant."}' $B/books/$ID/paragraphs/$P1/edits/me | json 'd["version"]')" 1 "saved, version"
expect "$(curl -s -H "$A" $B/books/$ID | json 'd["paragraphs"][0]["my_edit"]["text_en"]')" "Long ago, there was a merchant." "re-read returns the correction"

echo "failure paths:"
expect "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH -H "$A" -H 'content-type: application/json' \
  -d '{"base_version":0,"text_en":"stale tab"}' $B/books/$ID/paragraphs/$P1/edits/me)" 409 "stale save rejected"
expect "$(curl -s -H "$A" $B/books/$ID | json 'd["paragraphs"][0]["my_edit"]["text_en"]')" "Long ago, there was a merchant." "correction intact after stale save"
expect "$(curl -s -o /dev/null -w '%{http_code}' -H "$S" $B/books/$ID)" 404 "other user cannot see the book"
expect "$(curl -s -o /dev/null -w '%{http_code}' $B/books)" 401 "no session"
echo "smoke passed"
