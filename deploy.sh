#!/bin/bash
# 國旅卡特約商店查詢系統 — 生產部署腳本（Ubuntu server 用）
# 用法：./deploy.sh
# 做什麼：build → up -d → 等健康 → 打驗收 curl。
# 注意：切勿直接 `docker compose up`（會少 nginx）或套用 docker-compose.dev.yml（會停掉排程）。

set -euo pipefail
cd "$(dirname "$0")"

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

echo "==> build"
$COMPOSE build

echo "==> up -d"
$COMPOSE up -d

echo "==> 等 backend 就緒（最多 120s）"
for i in $(seq 1 60); do
  if $COMPOSE exec -T backend curl -sf http://localhost:8000/api/ready >/dev/null 2>&1; then
    echo "backend ready"
    break
  fi
  sleep 2
  if [ "$i" = 60 ]; then echo "backend 仍未健康，請看 logs"; exit 1; fi
done

echo "==> 驗收"
curl -sf 127.0.0.1:8088/api/ready
if ! curl -fsS 127.0.0.1:8088/api/health; then
  echo "資料健康檢查未通過，請檢查排程 logs；目前服務已可提供既有資料。"
fi
curl -sf 127.0.0.1:8088/api/data-info | head -c 300; echo
for p in "/" "/sitemap.xml" "/sitemap-index.xml" "/robots.txt" "/llms.txt"; do
  printf "%s " "$p"
  curl -s -o /dev/null -w "%{http_code}\n" "127.0.0.1:8088$p"
done
manifest_file=$(mktemp)
trap 'rm -f "$manifest_file"' EXIT
curl -fsS 127.0.0.1:8088/api/sitemaps/manifest > "$manifest_file"
for i in $(python3 -c 'import json,sys; print(" ".join(str(s["id"]) for s in json.load(open(sys.argv[1]))["shards"]))' "$manifest_file"); do
  printf "/sitemap-merchants-%s.xml " "$i"
  curl -fsS -o /dev/null -w "%{http_code}\n" "127.0.0.1:8088/sitemap-merchants-$i.xml"
done
echo "deploy.sh 完成"
