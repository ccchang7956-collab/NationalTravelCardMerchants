#!/bin/bash
# 國旅卡特店 - 自動下載與匯入行業別資料至 Docker 資料庫
# 用法: ./scripts/import_docker_industry.sh

# 啟用 set -e，任一步驟失敗就立刻中斷退出
set -e

TEMP_DIR="/tmp/ntc_industry_import"
ZIP_URL="https://eip.fia.gov.tw/data/BGMOPEN1.zip"
ZIP_FILE="$TEMP_DIR/BGMOPEN1.zip"

echo "📂 1. 建立本地臨時工作目錄 $TEMP_DIR..."
mkdir -p "$TEMP_DIR"

echo "📥 2. 正在從財政部電子發票網站下載最新稅籍登記資料集 (ZIP)..."
echo "下載連結: $ZIP_URL"
curl -L -o "$ZIP_FILE" "$ZIP_URL"

echo "📦 3. 正在解壓縮資料集檔案..."
unzip -o "$ZIP_FILE" -d "$TEMP_DIR"

# 尋找解壓出的 CSV 檔案
CSV_PATH=$(find "$TEMP_DIR" -name "*.csv" | head -n 1)
if [ -z "$CSV_PATH" ] || [ ! -f "$CSV_PATH" ]; then
  echo "❌ 錯誤: 解壓縮後未找到任何 CSV 檔案！"
  rm -rf "$TEMP_DIR"
  exit 1
fi
echo "✅ 成功取得 CSV 檔案: $(basename "$CSV_PATH")"

echo "🔄 4. 正在 Docker 中初始化資料庫與特店資料..."
docker compose exec scheduler python /app/update_data.py

echo "🚚 5. 正在將 CSV 檔案與匯入腳本複製到 Docker backend 容器中..."
# 獲取 backend 容器 ID
CONTAINER_ID=$(docker compose ps -q backend)
if [ -z "$CONTAINER_ID" ]; then
  echo "❌ 錯誤: backend 容器未啟動，請先執行 docker compose up -d 啟動服務"
  rm -rf "$TEMP_DIR"
  exit 1
fi
docker cp "$CSV_PATH" "$CONTAINER_ID:/tmp/tax.csv"
docker cp "scripts/import_industry.py" "$CONTAINER_ID:/tmp/import_industry.py"

echo "🚀 6. 正在 backend 容器內執行匯入腳本 (此步驟需要數十秒，請稍候)..."
docker compose exec backend python /tmp/import_industry.py --csv /tmp/tax.csv --db /data/merchants.db

echo "🧹 7. 清除 Docker 容器與本地的暫存檔案..."
docker compose exec --user root backend rm -f /tmp/tax.csv /tmp/import_industry.py
rm -rf "$TEMP_DIR"

echo "✨ 完成！最新的營業登記行業別資料已自動下載並成功匯入 Docker 資料庫。"
