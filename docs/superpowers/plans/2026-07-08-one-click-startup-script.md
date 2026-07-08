# 建立 macOS 一鍵啟動腳本實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為專案新增一個 `start.sh` 腳本，讓使用者在 macOS 平台（MacBook Pro）上能一鍵完成環境變數複製、Docker 狀態檢測與自動啟動、服務編譯運行，並在服務就緒後自動開啟網頁。

**Architecture:** 撰寫 Bash 腳本，封裝環境變數 `.env` 檢查複製、Docker Daemon 檢測（透過 `docker info`）及 `open -a Docker` 系統調用，並使用 `curl` 輪詢檢查前端就緒狀態，最後透過 `open` 開啟預設瀏覽器。

**Tech Stack:** Bash shell 腳本, Docker Compose, macOS cli (`open`), curl

## Global Constraints
* 一切都用繁體中文回答使用者。
* 腳本放置於專案根目錄，名稱為 `start.sh`。

---

### Task 1: 實作 macOS 一鍵啟動腳本

**Files:**
- Create: `/Users/ccchang/Project/NationalTravelCardMerchants/start.sh`

**Interfaces:**
- Consumes: `/Users/ccchang/Project/NationalTravelCardMerchants/.env.example`
- Produces: 可執行的啟動腳本 `start.sh`

- [ ] **Step 1: 建立並寫入啟動腳本檔案**
  
  在專案根目錄下建立 `start.sh` 檔案，內容如下：
  ```bash
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
  FRONTEND_PORT=$(grep -E "^FRONTEND_PORT=" .env | cut -d'=' -f2)
  FRONTEND_PORT=${FRONTEND_PORT:-3000}

  # 2. 檢查 Docker 是否安裝
  log_info "正在檢查 Docker 是否已安裝..."
  if ! command -v docker &> /dev/null; then
      log_error "未偵測到 Docker！"
      log_error "請先安裝 Docker Desktop，網址：https://www.docker.com/products/docker-desktop/"
      exit 1
  fi
  log_success "Docker 已安裝。"

  # 3. 檢查 Docker 服務 (Daemon) 是否正在運行
  log_info "正在檢查 Docker 服務是否已運行..."
  if ! docker info &> /dev/null; then
      log_warning "Docker 服務尚未運行。正在嘗試自動開啟 Docker Desktop..."
      
      # macOS 專屬命令開啟 Docker Desktop
      open -a Docker
      
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
      
      if [ "$docker_ready" = false ]; then
          echo -ne "\n"
          log_error "Docker 啟動超時！請手動開啟 Docker Desktop 應用程式後重新運行此腳本。"
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
      http_code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:${FRONTEND_PORT})
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
  ```

- [ ] **Step 2: 賦予腳本執行權限**
  
  命令：`chmod +x start.sh`
  預期輸出：無輸出，但腳本變成可執行。

- [ ] **Step 3: 驗證腳本執行結果**
  
  在終端機中運行 `./start.sh`，檢視整個檢查與啟動流程是否流暢，確認最終是否成功啟動容器並開啟瀏覽器。

- [ ] **Step 4: 提交程式碼**
  
  命令：
  ```bash
  git add start.sh
  git commit -m "feat: add macOS one-click startup script start.sh"
  ```
