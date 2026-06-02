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
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 複製腳本
COPY update_data.py .
COPY crontab /etc/supercronic/crontab

# 建立非 root 使用者並給予 /data 權限
RUN groupadd -r scheduler && useradd -r -g scheduler scheduler \
    && mkdir -p /data && chown scheduler:scheduler /data \
    && chown scheduler:scheduler /etc/supercronic/crontab

USER scheduler

# 預設以 supercronic 排程模式運行
# 手動測試請執行：docker compose exec scheduler python /app/update_data.py
CMD ["supercronic", "/etc/supercronic/crontab"]
