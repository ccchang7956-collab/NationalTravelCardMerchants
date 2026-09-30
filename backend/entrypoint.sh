#!/bin/sh
# backend entrypoint：修復 /data（named volume）權限後再降權啟動 uvicorn。
#
# 背景：同 scheduler/entrypoint.sh — named volume 掛載會覆蓋 image 內權限，
# 首次掛載時 /data 屬主為 root，ntcuser (uid 1000) 無法建立 SQLite WAL，
# 造成 API 寫入失敗。因此以 root 起手 chown，再降權為 ntcuser 執行。
set -eu

if [ "$(id -u)" = "0" ]; then
  mkdir -p /data
  DB_DIR="$(dirname "${DB_PATH:-/data/merchants.db}")"
  if [ -n "$DB_DIR" ] && [ "$DB_DIR" != "." ] && [ "$DB_DIR" != "/" ]; then
    mkdir -p "$DB_DIR" 2>/dev/null || true
    chown -R 1000:1000 "$DB_DIR" 2>/dev/null || true
  fi
  chown -R 1000:1000 /data 2>/dev/null || true
  chmod 755 /data 2>/dev/null || true
  if command -v su >/dev/null 2>&1; then
    exec su ntcuser -s /bin/sh -c 'exec "$0" "$@"' "$@"
  elif command -v runuser >/dev/null 2>&1; then
    exec runuser -u ntcuser -- "$@"
  fi
fi

exec "$@"
