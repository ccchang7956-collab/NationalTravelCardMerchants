# Ubuntu Server 部署說明（nginx + Cloudflare Tunnel）

適用：b1408c-ubuntu-server（專案放 `/var/chang/`，對外經 Cloudflare Tunnel）。

## 架構

```
Internet → Cloudflare Tunnel (ntc.shibaalin.com)
  → 127.0.0.1:8088 → nginx → / → frontend:3000
                              → /api/ → backend:8000
                              → scheduler（排程更新 DB，與 backend 共用 volume）
```

關鍵觀念：

- 瀏覽器會**直連 backend**（見 `frontend/src/utils/env.ts`），但 Tunnel 一個 hostname 只能指一個 port，所以本機用 nginx 把 `/` 和 `/api/` 分流到兩個容器。
- `NEXT_PUBLIC_API_URL`、`NEXT_PUBLIC_SITE_URL` 是 **build-time 烘進前端映像**（見 `frontend/Dockerfile`），換網域必須重 build 前端。
- **上線一律用 `./deploy.sh`**（內含 `-f docker-compose.yml -f docker-compose.prod.yml`），不要直接 `docker compose up`：少 nginx 不說，誤套 `docker-compose.dev.yml` 會把 scheduler 蓋成 `sleep infinity`（本地開發用），排程就不會跑。`start.sh` 僅限 macOS，有 Darwin 護欄。
- `nginx.conf`、`docker-compose.prod.yml` 已進版控（無 secret），改完直接 commit。

## 1. 取 repo

```bash
sudo mkdir -p /var/chang
cd /var/chang
git clone https://github.com/ccchang7956-collab/NationalTravelCardMerchants
ln -s /var/chang/NationalTravelCardMerchants ~/NationalTravelCardMerchants
cd ~/NationalTravelCardMerchants
cp .env.example .env
openssl rand -hex 32   # 產生 JWT key，填入下方 .env
```

## 2. 寫 `.env`

> 主機的 8000 已被其他專案佔用，所以 backend/frontend 改用 18080/13000。
> 以下以 `ntc.shibaalin.com` 為例，換成實際 hostname 即可。

```bash
NEXT_PUBLIC_SITE_URL=https://ntc.shibaalin.com
NEXT_PUBLIC_API_URL=https://ntc.shibaalin.com
CORS_ORIGINS=https://ntc.shibaalin.com
```

> JWT 已退役（純公開站），`.env` 留空即可；舊值留著也無害。
> BACKEND_PORT/FRONTEND_PORT 在 prod 無作用（backend/frontend 不對外發
> 布 port，唯一入口是 127.0.0.1:8088），只影響本地跑 base/dev compose。

## 3. `nginx.conf`（已進版控，改完 commit 即可）

```nginx
server {
  listen 80;
  location = /api {
    return 308 /api/;
  }
  location /api/ {
    proxy_pass http://backend:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
  location / {
    proxy_pass http://frontend:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```
（實際檔另有 X-Real-IP/XFF/timeout，以 repo 內為準）

## 4. `docker-compose.prod.yml`（已進版控）

```yaml
services:
  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "127.0.0.1:8088:80"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - frontend
      - backend
```
另把 backend/frontend 的 port 蓋回 `127.0.0.1`（base 是 `0.0.0.0`，prod 不該直連暴露）。

> 8088 選用原因：80–8087 都已被其他專案佔用。

## 5. 建置＋啟動（用 deploy.sh，一鍵含驗收）

```bash
./deploy.sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

## 6. 灌第一次資料

DB 初始是空的，scheduler 半夜 3 點（台北）才會自動跑，第一次手動觸發（約數分鐘、5 萬多筆）：

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec scheduler python /app/update_data.py
curl 127.0.0.1:8088/api/health
curl 127.0.0.1:8088/api/data-info
```

`total_merchants` 有數字即成功，之後每天自動更新。

## 7. 接 Cloudflare Tunnel

`/etc/cloudflared/config.yml` 加一條（放 `service: http_status:404` 上面）：

```yaml
  - hostname: ntc.shibaalin.com
    service: http://localhost:8088
```

```bash
cloudflared tunnel route dns 3e69ed56-40fb-448c-b476-35f13d5c2b06 ntc.shibaalin.com
sudo systemctl restart cloudflared
curl https://ntc.shibaalin.com/api/health
```

## 8. 上線驗收

- 開 `https://ntc.shibaalin.com`，店家列表有數字。
- `/sitemap.xml`（首頁）、`/llms.txt` 與 `robots.txt` 都使用正式網域。商家分片由 `/api/sitemaps/manifest` 決定，每片最多 10,000 筆，超過 60,000 筆會自動新增第 7 片。
- `robots.txt` 列出目前所有 `/merchants/sitemap/<id>.xml`；Google Search Console 可使用這份動態清單提交。
- `/api/ready` 回 200 表示資料庫可提供查詢；`/api/health` 另監控最後成功檢查。最近更新失敗為 degraded、超過 `DATA_STALE_AFTER_HOURS` 為 stale，皆回 503，但服務仍可提供既有資料。
- `.env` 的 `DATA_STALE_AFTER_HOURS`、`NOTIFY_WEBHOOK_URL`、`MASS_DELETE_MIN_OLD`、`MASS_DELETE_RATIO` 已傳入對應容器。修改後重新建立容器讓設定生效；非法數值會告警並採預設。

## 日常維運

```bash
cd ~/NationalTravelCardMerchants
git pull
# 有改到前端（或換網域）：重 build 前端
docker compose -f docker-compose.yml -f docker-compose.prod.yml build frontend
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
# 看 log
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f scheduler
```

> DB 放在 named volume，`pull` + 重建容器不會掉資料（商家、使用者資料都保留）。
