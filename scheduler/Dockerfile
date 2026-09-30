FROM python:3.12-slim

# 安裝系統依賴
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 安裝 supercronic（依架構自動選擇，支援 amd64 / arm64）
# https://github.com/aptible/supercronic/releases
ARG SUPERCRONIC_VERSION=v0.2.33
RUN ARCH=$(dpkg --print-architecture) && \
    curl -fsSL \
        "https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-linux-${ARCH}" \
        -o /usr/local/bin/supercronic && \
    chmod +x /usr/local/bin/supercronic && \
    /usr/local/bin/supercronic --version

WORKDIR /app

# 安裝 Python 套件
COPY scheduler/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 複製腳本（build context 為 repo root，見 docker-compose.yml）
COPY scheduler/update_data.py .
COPY backend/database.py ./vendor_backend_database.py
COPY scheduler/crontab /etc/supercronic/crontab

# 建立非 root 使用者並給予 /data 權限 (統一 UID/GID 1000 以避免 Volume 權限衝突)
RUN groupadd -g 1000 ntcuser && useradd -u 1000 -g ntcuser -s /bin/sh ntcuser \
    && mkdir -p /data && chown ntcuser:ntcuser /data \
    && chown ntcuser:ntcuser /etc/supercronic/crontab

USER ntcuser

# 預設以 supercronic 排程模式運行
# 手動測試請執行：docker compose exec scheduler python /app/update_data.py
CMD ["supercronic", "/etc/supercronic/crontab"]
