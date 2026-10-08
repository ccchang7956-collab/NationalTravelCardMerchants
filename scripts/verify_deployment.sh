#!/bin/bash
# Read-only HTTP acceptance checks; usable independently of deployment.
set -euo pipefail

verification_base=${1:-http://127.0.0.1:8088}
verification_log_dir=${DEPLOY_LOG_DIR:-./deploy-logs}
mkdir -p "$verification_log_dir"
verification_log=$(mktemp "$verification_log_dir/verification-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX.log")
verification_body=$(mktemp)
verification_manifest=$(mktemp)
trap 'rm -f "$verification_body" "$verification_manifest"' EXIT
echo "驗收紀錄：$verification_log"

check_route() {
  local route=$1 status
  if ! status=$(curl --silent --show-error --connect-timeout 5 --max-time 20 \
    --output "$verification_body" --write-out '%{http_code}' "${verification_base%/}$route" 2>>"$verification_log"); then
    printf '%s request failed\n' "$route" | tee -a "$verification_log" >&2
    return 1
  fi
  printf '%s HTTP %s\n' "$route" "$status" | tee -a "$verification_log"
  if [ "$status" != "200" ]; then
    head -c 2000 "$verification_body" >> "$verification_log"
    printf '\n驗收失敗：%s 預期 HTTP 200，收到 %s。詳見 %s\n' "$route" "$status" "$verification_log" >&2
    return 1
  fi
}

for verification_route in /api/ready /api/health /api/data-info / /sitemap.xml /sitemap-index.xml /robots.txt /llms.txt; do
  check_route "$verification_route"
done
check_route /api/sitemaps/manifest
cp "$verification_body" "$verification_manifest"
if ! verification_shards=$(python3 - "$verification_manifest" <<'PY'
import json
import sys

manifest = json.load(open(sys.argv[1], encoding="utf-8"))
shards = manifest["shards"]
if not isinstance(shards, list):
    raise ValueError("Invalid sitemap manifest")
ids = [shard["id"] for shard in shards]
if any(type(value) is not int or value < 0 for value in ids) or len(ids) != len(set(ids)):
    raise ValueError("Invalid sitemap shard IDs")
print(" ".join(str(value) for value in ids))
PY
); then
  printf 'Invalid sitemap manifest\n' >> "$verification_log"
  echo "驗收失敗：sitemap manifest 格式錯誤。詳見 $verification_log" >&2
  exit 1
fi
for verification_shard in $verification_shards; do
  check_route "/sitemap-merchants-$verification_shard.xml"
done
echo "所有路由驗收通過" | tee -a "$verification_log"
