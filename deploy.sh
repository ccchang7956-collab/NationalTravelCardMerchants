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

echo "==> 等 backend 健康（最多 120s）"
for i in $(seq 1 60); do
  if $COMPOSE exec -T backend curl -sf http://localhost:8000/api/health >/dev/null 2>&1; then
    echo "backend healthy"
    break
  fi
  sleep 2
  if [ "$i" = 60 ]; then echo "backend 仍未健康，請看 logs"; exit 1; fi
done

echo "==> 驗收"
curl -sf 127.0.0.1:8088/api/health | head -c 300; echo
curl -sf 127.0.0.1:8088/api/data-info | head -c 300; echo
for p in "/" "/sitemap.xml" "/robots.txt" "/llms.txt"; do
  printf "%s " "$p"
  curl -s -o /dev/null -w "%{http_code}\n" "127.0.0.1:8088$p"
done
for i in 0 1 2 3 4 5; do
  printf "/merchants/sitemap/%s.xml " "$i"
  curl -s -o /dev/null -w "%{http_code}\n" "127.0.0.1:8088/merchants/sitemap/$i.xml"
done
echo "deploy.sh 完成"
