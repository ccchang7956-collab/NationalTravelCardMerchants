#!/usr/bin/env bash
# Task5 infra check: TZ / scheduler decoupling / perms / observability
# Usage: bash scripts/check_infra.sh
set -u

PASS=0
FAIL=0

ok()   { echo "PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL+1)); }

COMPOSE="docker-compose.yml"

# 1. TZ=Asia/Taipei 必須出現在 backend / frontend / scheduler 三個 service
for svc in backend frontend scheduler; do
  # 取出該 service 區塊（到下一個頂層 service 或 volumes 為止）再檢查 TZ
  block=$(awk "/^  $svc:/{flag=1;next}/^  [a-z]+:/{if(flag)exit}/^volumes:/{if(flag)exit}{if(flag)print}" "$COMPOSE")
  if echo "$block" | grep -q "Asia/Taipei"; then
    ok "$svc TZ=Asia/Taipei"
  else
    fail "$svc 缺少 TZ=Asia/Taipei"
  fi
done

# 2. scheduler 不得 depends_on backend（解耦：排程只寫 DB 檔，不經 API）
sched_block=$(awk '/^  scheduler:/{flag=1;next}/^  [a-z]+:/{if(flag)exit}/^volumes:/{if(flag)exit}{if(flag)print}' "$COMPOSE")
if echo "$sched_block" | grep -q "depends_on"; then
  fail "scheduler 仍有 depends_on（應移除）"
else
  ok "scheduler 無 depends_on"
fi

# 3. 後端 /api/health 存在且回傳 update_meta.json 新鮮度（>48h 告警）
if grep -rq "api/health" backend/ 2>/dev/null && grep -rq "update_meta" backend/ 2>/dev/null; then
  ok "後端 /api/health + update_meta 新鮮度"
else
  fail "後端缺少 /api/health 或 update_meta 新鮮度邏輯"
fi

# 4. scheduler 有 healthcheck（檢查 /data/update_meta.json）
if echo "$sched_block" | grep -q "healthcheck" && echo "$sched_block" | grep -q "update_meta.json"; then
  ok "scheduler healthcheck 檢查 update_meta.json"
else
  fail "scheduler 缺少 healthcheck / update_meta.json 檢查"
fi

# 5. /data 權限處理：entrypoint 或 Dockerfile 必須處理 chown /data
perm_ok=0
if grep -rq "chown.*\/data" scheduler/entrypoint.sh backend/entrypoint.sh 2>/dev/null; then
  perm_ok=1
elif grep -q "chown.*\/data" scheduler/Dockerfile 2>/dev/null && grep -q "ENTRYPOINT" scheduler/Dockerfile 2>/dev/null; then
  perm_ok=1
fi
if [ "$perm_ok" -eq 1 ]; then
  ok "/data 權限 entrypoint 處理"
else
  fail "/data 權限未處理（需要 entrypoint chown /data）"
fi

# 8. CI：.github/workflows/build.yml 存在且含 pytest + jest + compose build
ci_file=".github/workflows/build.yml"
if [ -f "$ci_file" ] \
  && grep -q "pytest" "$ci_file" \
  && grep -q "jest" "$ci_file" \
  && grep -q "compose.*build" "$ci_file"; then
  ok "CI build.yml 含 pytest + jest + compose build"
else
  fail "CI 缺少 .github/workflows/build.yml 或未含 pytest/jest/compose build"
fi

# 9. scheduler 更新失敗通知鉤子：update_data.py 含 NOTIFY_WEBHOOK_URL 環境鉤子
if grep -q "NOTIFY_WEBHOOK_URL" scheduler/update_data.py 2>/dev/null; then
  ok "scheduler 含 NOTIFY_WEBHOOK_URL 失敗通知鉤子"
else
  fail "scheduler 缺少 NOTIFY_WEBHOOK_URL 失敗通知鉤子"
fi

echo "---"
echo "PASS=$PASS FAIL=$FAIL"
if [ "$FAIL" -ne 0 ]; then
  exit 1
fi
echo "INFRA OK"
