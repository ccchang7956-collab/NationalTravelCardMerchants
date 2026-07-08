#!/bin/bash

# 國旅卡特約商店查詢系統 — macOS 一鍵啟動腳本
# 此腳本專為 macOS / MacBook Pro 設計，包含 Docker 環境檢查、自動啟動與服務健康檢查。

# ANSI 顏色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 1. 檢查環境變數檔案
log_info "正在檢查環境變數檔案..."
if [ ! -f ".env" ]; then
    log_warning ".env 檔案不存在，正在自 .env.example 複製..."
    if [ -f ".env.example" ]; then
        cp .env.example .env
        log_success "已成功複製 .env.example 至 .env"
    else
        log_error "找不到 .env.example 檔案，無法建立環境設定！"
        exit 1
    fi
else
    log_success ".env 檔案已存在。"
fi

# 讀取 .env 中的設定 (預設 FRONTEND_PORT=3000)
FRONTEND_PORT=$(grep -E "^FRONTEND_PORT[[:space:]]*=" .env | tail -n 1 | cut -d'=' -f2- | tr -d ' \r\t"'\''')
if ! echo "$FRONTEND_PORT" | grep -qE '^[0-9]+$' || [ "$FRONTEND_PORT" -lt 1 ] || [ "$FRONTEND_PORT" -gt 65535 ]; then
    log_warning ".env 中的 FRONTEND_PORT 設定無效或非合法連接埠（1-65535），將使用預設值 3000"
    FRONTEND_PORT=3000
fi

# 2. 檢查 Docker 是否安裝
log_info "正在檢查 Docker 是否已安裝..."
if ! command -v docker &> /dev/null; then
    log_error "未偵測到 Docker！"
    log_error "請先安裝 Docker Desktop 或 OrbStack！"
    exit 1
fi
log_success "Docker 已安裝。"

# 3. 檢查 Docker 服務 (Daemon) 是否正在運行
log_info "正在檢查 Docker 服務是否已運行..."
if ! docker info &> /dev/null; then
    log_warning "Docker 服務尚未運行。正在嘗試開啟 Docker/OrbStack..."
    
    # 支援 OrbStack 與 Docker Desktop 啟動
    if [ -d "/Applications/OrbStack.app" ]; then
        log_info "偵測到 OrbStack，正在開啟 OrbStack..."
        open -a OrbStack
    elif [ -d "/Applications/Docker.app" ]; then
        log_info "偵測到 Docker Desktop，正在開啟 Docker Desktop..."
        open -a Docker
    else
        log_warning "未在常見路徑中找到 Docker.app 或 OrbStack.app，嘗試通用開啟指令..."
        open -a OrbStack 2>/dev/null || open -a Docker 2>/dev/null
    fi
    
    log_info "正在等待 Docker 啟動（最多等待 60 秒）..."
    timeout=60
    elapsed=0
    docker_ready=false
    
    while [ $elapsed -lt $timeout ]; do
        echo -ne "等待中... (${elapsed}s / ${timeout}s)\r"
        if docker info &> /dev/null; then
            docker_ready=true
            echo -ne "\n"
            break
        fi
        sleep 2
        elapsed=$((elapsed + 2))
    done
    
    # 迴圈結束後，若仍未 ready，在宣告失敗前進行最後一次的 docker info 複檢
    if [ "$docker_ready" = false ]; then
        if docker info &> /dev/null; then
            docker_ready=true
        fi
    fi
    
    if [ "$docker_ready" = false ]; then
        echo -ne "\n"
        log_error "Docker 啟動超時！請手動開啟 Docker Desktop 或 OrbStack 應用程式後重新運行此腳本。"
        exit 1
    fi
fi
log_success "Docker 服務已運行。"

# 4. 啟動 Docker 容器
log_info "正在使用 Docker Compose 啟動服務（並重新編譯變更）..."
docker compose up --build -d

if [ $? -ne 0 ]; then
    log_error "Docker Compose 啟動失敗！"
    exit 1
fi
log_success "Docker 服務已在背景啟動。"

# 5. 等待前端就緒並開啟網頁
log_info "正在等待前端網頁就緒 (http://localhost:${FRONTEND_PORT})..."
max_wait=30
wait_count=0
frontend_ready=false

while [ $wait_count -lt $max_wait ]; do
    http_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 -m 5 http://localhost:${FRONTEND_PORT})
    if echo "$http_code" | grep -qE "^(200|301|302|307|308)$"; then
        frontend_ready=true
        break
    fi
    echo -ne "等待前端就緒中... (${wait_count}s)\r"
    sleep 1
    wait_count=$((wait_count + 1))
done

if [ "$frontend_ready" = true ]; then
    echo -ne "\n"
    log_success "前端服務已就緒！"
    log_info "正在為您開啟瀏覽器..."
    open "http://localhost:${FRONTEND_PORT}"
else
    echo -ne "\n"
    log_warning "已超時但前端服務仍未就緒，您可以手動嘗試連接：http://localhost:${FRONTEND_PORT}"
fi

log_success "一鍵啟動腳本執行完畢！"
