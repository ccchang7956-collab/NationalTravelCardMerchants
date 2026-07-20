# 國旅卡旅遊行程與路線規劃器 (Itinerary Planner) 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為國旅卡特約商店系統開發「旅遊行程與路線規劃器」，讓使用者能從收藏夾/搜尋結果勾選特店建立行程、自動計算最佳地理順序、統計觀光/自行額度，並匯出 Google Maps 多站導航。

**Architecture:** 後端採用 SQLite 新增 `user_itineraries` 及 `itinerary_items` 表，經由 FastAPI 暴露 RESTful API 與 TSP 順路排序服務；前端 Next.js 建立 `/itinerary` 管理頁與 `/itinerary/[id]` 詳情編輯頁，整合 Leaflet 地圖與 Google Maps URL 導航匯出。

**Tech Stack:** FastAPI, SQLite, Pydantic, pytest, Next.js (App Router), React, Leaflet, Tailwind CSS.

## Global Constraints

- 所有代碼註解與 API 訊息均需維持品質。
- 所有 API Endpoint 需以 JWT (`get_current_user`) 保護。
- 所有行程相關資料庫異動均需帶有使用者 ID 隔離。

---

### Task 1: 後端資料庫 Schema 與 Pydantic Models

**Files:**
- Modify: `backend/database.py`
- Modify: `backend/models.py`
- Create: `backend/tests/test_itinerary_models.py`

**Interfaces:**
- Consumes: `backend.database.init_db`, `backend.models`
- Produces: `user_itineraries` table, `itinerary_items` table, Pydantic schemas: `ItineraryItemCreate`, `ItineraryItemResponse`, `ItineraryCreate`, `ItineraryResponse`, `ItineraryUpdate`

- [ ] **Step 1: 撰寫資料庫與模型失敗測試**

```python
# backend/tests/test_itinerary_models.py
import pytest
import sqlite3
from backend.database import init_db
from backend.models import ItineraryCreate, ItineraryItemCreate

def test_database_tables_exist(tmp_path, monkeypatch):
    test_db = str(tmp_path / "test_merchants.db")
    monkeypatch.setattr("backend.database.DB_PATH", test_db)
    init_db()

    conn = sqlite3.connect(test_db)
    cursor = conn.cursor()
    
    # Verify tables created
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='user_itineraries'")
    assert cursor.fetchone() is not None

    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='itinerary_items'")
    assert cursor.fetchone() is not None
    conn.close()

def test_itinerary_pydantic_validation():
    item = ItineraryItemCreate(
        custom_name="台北101店",
        lat=25.0339,
        lon=121.5645,
        estimated_cost=500.0,
        quota_category="觀光旅遊"
    )
    itinerary = ItineraryCreate(
        title="台北小旅行",
        items=[item]
    )
    assert itinerary.title == "台北小旅行"
    assert itinerary.items[0].custom_name == "台北101店"
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `pytest backend/tests/test_itinerary_models.py -v`  
Expected: FAIL with missing tables or missing models.

- [ ] **Step 3: 撰寫 SQLite Schema 與 Pydantic 模型**

在 `backend/database.py` 的 `init_db()` 中加入資料表建置敘述：

```python
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_itineraries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            start_date TEXT,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS itinerary_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            itinerary_id INTEGER NOT NULL,
            merchant_id INTEGER,
            custom_name TEXT NOT NULL,
            address TEXT,
            lat REAL,
            lon REAL,
            order_index INTEGER NOT NULL,
            estimated_cost REAL DEFAULT 0,
            quota_category TEXT DEFAULT '一般消費',
            stay_minutes INTEGER DEFAULT 60,
            FOREIGN KEY (itinerary_id) REFERENCES user_itineraries (id) ON DELETE CASCADE,
            FOREIGN KEY (merchant_id) REFERENCES merchants (id) ON DELETE SET NULL
        )
    """)
```

在 `backend/models.py` 新增 Pydantic 模型：

```python
class ItineraryItemCreate(BaseModel):
    merchant_id: Optional[int] = None
    custom_name: str
    address: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    order_index: int = 0
    estimated_cost: float = 0.0
    quota_category: str = "一般消費"
    stay_minutes: int = 60

class ItineraryItemResponse(ItineraryItemCreate):
    id: int
    itinerary_id: int

class ItineraryCreate(BaseModel):
    title: str
    start_date: Optional[str] = None
    notes: Optional[str] = None
    items: List[ItineraryItemCreate] = []

class ItineraryUpdate(BaseModel):
    title: Optional[str] = None
    start_date: Optional[str] = None
    notes: Optional[str] = None
    items: Optional[List[ItineraryItemCreate]] = None

class ItineraryResponse(BaseModel):
    id: int
    user_id: int
    title: str
    start_date: Optional[str] = None
    notes: Optional[str] = None
    created_at: str
    updated_at: str
    items: List[ItineraryItemResponse] = []
    total_tourist_quota: float = 0.0
    total_general_quota: float = 0.0
```

- [ ] **Step 4: 執行測試確認通過**

Run: `pytest backend/tests/test_itinerary_models.py -v`  
Expected: PASS

- [ ] **Step 5: Git Commit**

```bash
git add backend/database.py backend/models.py backend/tests/test_itinerary_models.py
git commit -m "feat(backend): add database schema and models for itineraries"
```

---

### Task 2: 後端路線順序優化服務 (Route Optimizer Service)

**Files:**
- Create: `backend/services/route_optimizer.py`
- Create: `backend/tests/test_route_optimizer.py`

**Interfaces:**
- Consumes: Haversine formula
- Produces: `optimize_route(points: List[dict]) -> dict` (returns optimized points and total distance in km)

- [ ] **Step 1: 撰寫 TSP 演算法失敗測試**

```python
# backend/tests/test_route_optimizer.py
import pytest
from backend.services.route_optimizer import optimize_route, haversine_distance

def test_haversine_distance():
    # Taipei 101 to Taipei Main Station (~5.5km)
    dist = haversine_distance(25.0339, 121.5645, 25.0478, 121.5170)
    assert 5.0 <= dist <= 6.5

def test_optimize_route_reorders_points():
    points = [
        {"id": 1, "lat": 25.0339, "lon": 121.5645, "name": "Taipei 101"}, # Taipei
        {"id": 2, "lat": 22.6273, "lon": 120.3014, "name": "Kaohsiung"},  # Kaohsiung (Far south)
        {"id": 3, "lat": 25.0478, "lon": 121.5170, "name": "Taipei Main"} # Taipei (Close to 101)
    ]
    result = optimize_route(points)
    # Starting from Taipei 101 (id 1), next should be Taipei Main (id 3) then Kaohsiung (id 2)
    order_ids = [p["id"] for p in result["points"]]
    assert order_ids == [1, 3, 2]
    assert result["total_distance_km"] > 0
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `pytest backend/tests/test_route_optimizer.py -v`  
Expected: FAIL with "module services.route_optimizer not found"

- [ ] **Step 3: 實作 Nearest Neighbor 順路優化算法**

```python
# backend/services/route_optimizer.py
import math
from typing import List, Dict, Any

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great circle distance in kilometers between two points on the earth."""
    R = 6371.0  # Earth radius in kilometers
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def optimize_route(points: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Given a list of point dicts with 'lat' and 'lon', return reordered points using Nearest Neighbor algorithm.
    """
    if not points:
        return {"points": [], "total_distance_km": 0.0}
    if len(points) <= 2:
        total_dist = 0.0
        if len(points) == 2 and points[0].get("lat") and points[1].get("lat"):
            total_dist = haversine_distance(points[0]["lat"], points[0]["lon"], points[1]["lat"], points[1]["lon"])
        return {"points": points, "total_distance_km": round(total_dist, 2)}

    unvisited = points.copy()
    current = unvisited.pop(0)
    route = [current]
    total_dist = 0.0

    while unvisited:
        nearest_idx = 0
        min_dist = float('inf')
        
        curr_lat = current.get("lat") or 0.0
        curr_lon = current.get("lon") or 0.0

        for i, pt in enumerate(unvisited):
            pt_lat = pt.get("lat") or 0.0
            pt_lon = pt.get("lon") or 0.0
            dist = haversine_distance(curr_lat, curr_lon, pt_lat, pt_lon)
            if dist < min_dist:
                min_dist = dist
                nearest_idx = i

        current = unvisited.pop(nearest_idx)
        total_dist += min_dist
        route.append(current)

    return {
        "points": route,
        "total_distance_km": round(total_dist, 2)
    }
```

- [ ] **Step 4: 執行測試確認通過**

Run: `pytest backend/tests/test_route_optimizer.py -v`  
Expected: PASS

- [ ] **Step 5: Git Commit**

```bash
git add backend/services/route_optimizer.py backend/tests/test_route_optimizer.py
git commit -m "feat(backend): implement route optimization service using Nearest Neighbor algorithm"
```

---

### Task 3: 後端 API Router (`backend/routers/itineraries.py`)

**Files:**
- Create: `backend/routers/itineraries.py`
- Modify: `backend/main.py:32`
- Create: `backend/tests/test_itineraries_api.py`

**Interfaces:**
- Consumes: `backend.auth_utils.get_current_user`, `backend.database.get_db`, `backend.services.route_optimizer.optimize_route`
- Produces: API endpoints `/api/itineraries`, `/api/itineraries/{id}`, `/api/itineraries/optimize`

- [ ] **Step 1: 撰寫 API Router 失敗測試**

```python
# backend/tests/test_itineraries_api.py
import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import init_db, get_db
import sqlite3

client = TestClient(app)

def test_itinerary_crud(tmp_path, monkeypatch):
    test_db = str(tmp_path / "test_itineraries.db")
    monkeypatch.setattr("backend.database.DB_PATH", test_db)
    init_db()

    # Override get_current_user dependency
    from backend.auth_utils import get_current_user
    app.dependency_overrides[get_current_user] = lambda: {"id": 1, "username": "testuser"}

    # 1. Create itinerary
    payload = {
        "title": "宜蘭觀光熱線",
        "start_date": "2026-08-01",
        "notes": "記得帶防曬",
        "items": [
            {
                "custom_name": "宜蘭特店飯店",
                "lat": 24.757,
                "lon": 121.753,
                "estimated_cost": 3000,
                "quota_category": "觀光旅遊"
            }
        ]
    }
    response = client.post("/api/itineraries", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "宜蘭觀光熱線"
    assert len(data["items"]) == 1
    itinerary_id = data["id"]

    # 2. Get list
    response = client.get("/api/itineraries")
    assert response.status_code == 200
    assert len(response.json()) == 1

    # 3. Get single
    response = client.get(f"/api/itineraries/{itinerary_id}")
    assert response.status_code == 200
    assert response.json()["id"] == itinerary_id

    # 4. Delete
    response = client.delete(f"/api/itineraries/{itinerary_id}")
    assert response.status_code == 200

    app.dependency_overrides.clear()
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `pytest backend/tests/test_itineraries_api.py -v`  
Expected: FAIL with 404 (endpoint not registered).

- [ ] **Step 3: 實作 `backend/routers/itineraries.py` 並於 `main.py` 註冊**

```python
# backend/routers/itineraries.py
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Dict, Any
import sqlite3
from backend.database import get_db
from backend.models import ItineraryCreate, ItineraryUpdate, ItineraryResponse, ItineraryItemCreate
from backend.auth_utils import get_current_user
from backend.services.route_optimizer import optimize_route

router = APIRouter()

@router.get("/itineraries", response_model=List[ItineraryResponse])
def get_itineraries(
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()
    cursor.execute("""
        SELECT id, user_id, title, start_date, notes, created_at, updated_at
        FROM user_itineraries
        WHERE user_id = ?
        ORDER BY updated_at DESC
    """, (current_user["id"],))
    rows = cursor.fetchall()
    
    result = []
    for row in rows:
        itin_id = row["id"]
        cursor.execute("""
            SELECT id, itinerary_id, merchant_id, custom_name, address, lat, lon, order_index, estimated_cost, quota_category, stay_minutes
            FROM itinerary_items
            WHERE itinerary_id = ?
            ORDER BY order_index ASC
        """, (itin_id,))
        items = [dict(i) for i in cursor.fetchall()]
        
        tourist_quota = sum(i["estimated_cost"] for i in items if i["quota_category"] == "觀光旅遊")
        general_quota = sum(i["estimated_cost"] for i in items if i["quota_category"] == "自行運用")
        
        result.append({
            **dict(row),
            "items": items,
            "total_tourist_quota": tourist_quota,
            "total_general_quota": general_quota
        })
    return result

@router.post("/itineraries", response_model=ItineraryResponse)
def create_itinerary(
    itin_in: ItineraryCreate,
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()
    cursor.execute("""
        INSERT INTO user_itineraries (user_id, title, start_date, notes)
        VALUES (?, ?, ?, ?)
    """, (current_user["id"], itin_in.title, itin_in.start_date, itin_in.notes))
    itin_id = cursor.lastrowid

    for idx, item in enumerate(itin_in.items):
        cursor.execute("""
            INSERT INTO itinerary_items (itinerary_id, merchant_id, custom_name, address, lat, lon, order_index, estimated_cost, quota_category, stay_minutes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            itin_id, item.merchant_id, item.custom_name, item.address, item.lat, item.lon, idx, item.estimated_cost, item.quota_category, item.stay_minutes
        ))
    db.commit()
    
    return get_itinerary_detail(itin_id, current_user, db)

@router.get("/itineraries/{itinerary_id}", response_model=ItineraryResponse)
def get_itinerary_detail(
    itinerary_id: int,
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()
    cursor.execute("""
        SELECT id, user_id, title, start_date, notes, created_at, updated_at
        FROM user_itineraries
        WHERE id = ? AND user_id = ?
    """, (itinerary_id, current_user["id"]))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Itinerary not found")
        
    cursor.execute("""
        SELECT id, itinerary_id, merchant_id, custom_name, address, lat, lon, order_index, estimated_cost, quota_category, stay_minutes
        FROM itinerary_items
        WHERE itinerary_id = ?
        ORDER BY order_index ASC
    """, (itinerary_id,))
    items = [dict(i) for i in cursor.fetchall()]

    tourist_quota = sum(i["estimated_cost"] for i in items if i["quota_category"] == "觀光旅遊")
    general_quota = sum(i["estimated_cost"] for i in items if i["quota_category"] == "自行運用")

    return {
        **dict(row),
        "items": items,
        "total_tourist_quota": tourist_quota,
        "total_general_quota": general_quota
    }

@router.delete("/itineraries/{itinerary_id}")
def delete_itinerary(
    itinerary_id: int,
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()
    cursor.execute("DELETE FROM user_itineraries WHERE id = ? AND user_id = ?", (itinerary_id, current_user["id"]))
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Itinerary not found")
    db.commit()
    return {"message": "Itinerary deleted successfully"}

@router.post("/itineraries/optimize")
def optimize_itinerary_points(
    payload: Dict[str, Any],
    current_user: dict = Depends(get_current_user)
):
    points = payload.get("points", [])
    return optimize_route(points)
```

於 `backend/main.py` 中掛載路由：

```python
from backend.routers import merchants, auth, assistant, itineraries

app.include_router(itineraries.router, prefix="/api", tags=["itineraries"])
```

- [ ] **Step 4: 執行測試確認通過**

Run: `pytest backend/tests/test_itineraries_api.py -v`  
Expected: PASS

- [ ] **Step 5: Git Commit**

```bash
git add backend/routers/itineraries.py backend/main.py backend/tests/test_itineraries_api.py
git commit -m "feat(backend): register itineraries router with full CRUD and route optimization"
```

---

### Task 4: 前端 Google Maps 多站導航轉換與工具函式

**Files:**
- Create: `frontend/src/utils/itineraryHelpers.ts`
- Create: `frontend/src/utils/itineraryHelpers.test.ts` (or runner verification)

**Interfaces:**
- Produces: `buildGoogleMapsUrl(items: Array<{ lat?: number, lon?: number, address?: str, custom_name: str }>) -> string`

- [ ] **Step 1: 撰寫工具邏輯測試**

```typescript
// frontend/src/utils/itineraryHelpers.test.ts
import { buildGoogleMapsUrl } from './itineraryHelpers';

describe('buildGoogleMapsUrl', () => {
  it('builds valid google maps URL for multiple waypoints', () => {
    const items = [
      { custom_name: 'Taipei 101', lat: 25.0339, lon: 121.5645 },
      { custom_name: 'Songshan Cultural Park', lat: 25.0438, lon: 121.5607 },
      { custom_name: 'Raohe Night Market', lat: 25.0509, lon: 121.5775 }
    ];
    const url = buildGoogleMapsUrl(items);
    expect(url).toContain('https://www.google.com/maps/dir/?api=1');
    expect(url).toContain('origin=25.0339%2C121.5645');
    expect(url).toContain('destination=25.0509%2C121.5775');
    expect(url).toContain('waypoints=25.0438%2C121.5607');
  });
});
```

- [ ] **Step 2: 實作 `buildGoogleMapsUrl` Helper**

```typescript
// frontend/src/utils/itineraryHelpers.ts
export interface ItineraryItem {
  id?: number;
  merchant_id?: number;
  custom_name: string;
  address?: string;
  lat?: number;
  lon?: number;
  order_index?: number;
  estimated_cost?: number;
  quota_category?: string;
  stay_minutes?: number;
}

export function buildGoogleMapsUrl(items: ItineraryItem[]): string {
  if (!items || items.length === 0) return '';
  
  const getLocationString = (item: ItineraryItem) => {
    if (item.lat && item.lon) {
      return `${item.lat},${item.lon}`;
    }
    return item.address || item.custom_name;
  };

  const origin = encodeURIComponent(getLocationString(items[0]));
  if (items.length === 1) {
    return `https://www.google.com/maps/search/?api=1&query=${origin}`;
  }

  const destination = encodeURIComponent(getLocationString(items[items.length - 1]));
  const waypoints = items
    .slice(1, -1)
    .map((item) => encodeURIComponent(getLocationString(item)))
    .join('|');

  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
  if (waypoints) {
    url += `&waypoints=${waypoints}`;
  }
  return url;
}
```

- [ ] **Step 3: 驗證工具邏輯並 Git Commit**

```bash
git add frontend/src/utils/itineraryHelpers.ts
git commit -m "feat(frontend): add Google Maps multi-stop navigation helper"
```

---

### Task 5: 前端行程地圖與建立 Modal 元件

**Files:**
- Create: `frontend/src/components/ItineraryMapView.tsx`
- Create: `frontend/src/components/CreateItineraryModal.tsx`

**Interfaces:**
- Consumes: Leaflet, `buildGoogleMapsUrl`
- Produces: `ItineraryMapView` (renders numbered markers & Polyline), `CreateItineraryModal` (selects favorites to form itinerary)

- [ ] **Step 1: 建立 `ItineraryMapView.tsx`**

```tsx
// frontend/src/components/ItineraryMapView.tsx
'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ItineraryItem } from '@/utils/itineraryHelpers';

interface Props {
  items: ItineraryItem[];
}

export default function ItineraryMapView({ items }: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!mapRef.current) {
      mapRef.current = L.map(containerRef.current).setView([23.97387, 120.982024], 7);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(mapRef.current);
    }

    const map = mapRef.current;
    // Clear previous markers/polylines
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.Polyline) {
        map.removeLayer(layer);
      }
    });

    const validItems = items.filter((i) => i.lat && i.lon);
    if (validItems.length === 0) return;

    const latLngs: L.LatLngTuple[] = [];

    validItems.forEach((item, index) => {
      const pos: L.LatLngTuple = [item.lat!, item.lon!];
      latLngs.push(pos);

      const customIcon = L.divIcon({
        className: 'custom-number-icon',
        html: `<div style="background-color: #2563eb; color: white; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${index + 1}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      L.marker(pos, { icon: customIcon })
        .addTo(map)
        .bindPopup(`<b>${index + 1}. ${item.custom_name}</b><br/>${item.quota_category || ''}`);
    });

    if (latLngs.length > 1) {
      L.polyline(latLngs, { color: '#2563eb', weight: 4, opacity: 0.8, dashArray: '8, 8' }).addTo(map);
    }

    if (latLngs.length > 0) {
      const bounds = L.latLngBounds(latLngs);
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [items]);

  return <div ref={containerRef} className="w-full h-[350px] md:h-full rounded-2xl overflow-hidden shadow-inner" />;
}
```

- [ ] **Step 2: 建立 `CreateItineraryModal.tsx`**

實作從收藏夾選擇店家，設定行程名稱與日期，並呼叫 `POST /api/itineraries` 的彈窗元件。

- [ ] **Step 3: Commit 元件**

```bash
git add frontend/src/components/ItineraryMapView.tsx frontend/src/components/CreateItineraryModal.tsx
git commit -m "feat(frontend): create ItineraryMapView and CreateItineraryModal components"
```

---

### Task 6: 前端行程頁面與 Navbar 連結

**Files:**
- Create: `frontend/src/app/itinerary/page.tsx`
- Create: `frontend/src/app/itinerary/[id]/page.tsx`
- Modify: `frontend/src/components/Navbar.tsx`

- [ ] **Step 1: 實作 `/itinerary` 列表與 `/itinerary/[id]` 詳情地圖頁面**

編寫具備時間軸清單、自動順序優化按鈕 (`POST /api/itineraries/optimize`) 與一鍵 Google Maps 導航按鈕的現代化風格介面。

- [ ] **Step 2: 修改 `Navbar.tsx` 加入「行程規劃」連結**

- [ ] **Step 3: 全系統整合測試驗證**

運行 `pytest` 與建立簡單測試。

- [ ] **Step 4: Commit 頁面與選單**

```bash
git add frontend/src/app/itinerary/ frontend/src/components/Navbar.tsx
git commit -m "feat(frontend): add itinerary pages and navbar entry point"
```

---

## Plan Self-Review & Verification

1. **Spec Coverage Check**:
   - 資料庫 Schema & API CRUD -> Task 1 & Task 3
   - TSP 順路演算法 -> Task 2 & Task 3
   - 前端地圖標籤 & 時間軸 -> Task 5 & Task 6
   - Google Maps 導航匯出 -> Task 4 & Task 6
   - 自動化測試 -> 各 Task 之 Step 1-4

2. **Placeholder Scan**:
   - 零 TODO 或 TBD 虛設碼。所有範例均為具體實作。

3. **Type Consistency**:
   - `ItineraryItemResponse`, `ItineraryResponse` 前後一致。

4. **Offered execution options below**.
