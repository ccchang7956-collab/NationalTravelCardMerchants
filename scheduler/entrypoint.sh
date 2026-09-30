#!/bin/sh
# scheduler entrypoint：修復 /data（named volume）權限後再降權執行排程。
#
# 背景：image 建置期已 `chown ntcuser:ntcuser /data`，但 runtime 掛載的
# named volume（ntc_data）首次建立時屬主為 root，會覆蓋 image 內的權限，
# 導致 ntcuser (uid 1000) 無法寫入 merchants.db / update_meta.json。
# 因此容器以 root 起手做 `chown -R 1000:1000 /data`（失敗也不中斷），
# 再用 `su ntcuser` 降權 exec 真正的 CMD（supercronic），兼顧寫入權限與最小權限原則。
set -eu

if [ "$(id -u)" = "0" ]; then
  mkdir -p /data
  chown -R 1000:1000 /data 2>/dev/null || true
  chmod 755 /data 2>/dev/null || true
  if command -v su >/dev/null 2>&1; then
    exec su ntcuser -s /bin/sh -c 'exec "$0" "$@"' "$@"
  elif command -v runuser >/dev/null 2>&1; then
    exec runuser -u ntcuser -- "$@"
  fi
  # su/runuser 皆無時：維持原 CMD 執行（不靜默失敗，由上層可見錯誤）
fi

exec "$@"
