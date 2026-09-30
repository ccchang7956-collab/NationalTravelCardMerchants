FROM python:3.12-slim

WORKDIR /app

# 安裝系統依賴（PyMuPDF 需要）
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 安裝 Python 套件
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 複製程式碼（保留目錄結構，uvicorn 執行 backend.main:app 需要）
COPY backend/ ./backend/
COPY backend/entrypoint.sh /usr/local/bin/entrypoint.sh

# 建立非 root 使用者 (統一 UID/GID 1000 以避免 Volume 權限衝突)
# 注意：runtime 掛載的 named volume 會覆蓋 image 內的 /data 權限，
# 真正的修復在 entrypoint.sh（以 root 起手 chown 後降權執行），見該檔案說明。
RUN groupadd -g 1000 ntcuser && useradd -u 1000 -g ntcuser -s /bin/sh ntcuser \
    && chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/ || exit 1

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
