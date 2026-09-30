"""Phase 5 Task 3: sitemap index + 分片上限 + 真實 lastModified。

驗收：
- sitemap.ts 有 MAX_PAGES 分頁上限（總抓取有上限）。
- export generateSitemaps 產生 sitemap index（單檔 60000 URL 超 Google 50000
  上限，必須拆多檔；Next.js 會讓 /sitemap.xml 成為 index）。
- 每子檔 ≤10000 條商家 URL（PER_PAGE × PAGES_PER_FILE）。
- 分片總容量覆蓋約 55k 商家。
- lastModified 用後端 /api/data-info 的 last_updated 真值，fetch 失敗才 fallback new Date。
- 抓取失敗 break，避免無限迴圈。
"""
import pathlib
import re

SRC = pathlib.Path("frontend/src/app/sitemap.ts").read_text()


def test_sitemap_has_page_cap():
    assert "MAX_PAGES" in SRC and "50000" in SRC


def test_sitemap_page_cap_guards_loop():
    # while 迴圈必須受 MAX_PAGES 保護
    assert re.search(r"while\s*\(.*MAX_PAGES", SRC), \
        "分頁 while 迴圈應以 MAX_PAGES 設上限"


def test_sitemap_lastmod_from_data_info():
    # lastModified 必須來自 /api/data-info 的 last_updated 真值
    assert "data-info" in SRC, "應 fetch /api/data-info 取得 last_updated"
    assert "last_updated" in SRC, "應使用 data-info.last_updated 作為 lastModified"
    assert "lastModified" in SRC


def test_sitemap_fetch_failure_breaks():
    # 失敗必須 break（!res.ok break 或空頁 break）
    assert "break" in SRC, "抓取失敗應 break，避免無限迴圈"


def test_sitemap_index_generate_sitemaps():
    # 單檔 60000 超 Google 50000 上限 → 必須 export generateSitemaps 拆 index
    assert "generateSitemaps" in SRC, "應 export generateSitemaps 產生 sitemap index"
    assert re.search(r"function sitemap\([^)]*id", SRC), \
        "sitemap() 應接受分片 id 參數"


def test_sitemap_shard_size_within_limit():
    # 每子檔商家 URL 上限 ≤10000（遠低於 Google 50000 上限）
    per = int(re.search(r"PER_PAGE\s*=\s*(\d+)", SRC).group(1))
    ppf = int(re.search(r"PAGES_PER_FILE\s*=\s*(\d+)", SRC).group(1))
    assert per * ppf <= 10000, f"每子檔 {per * ppf} 條超過 10000 上限"


def test_sitemap_index_covers_all_merchants():
    # 分片總容量必須覆蓋約 55k 商家
    per = int(re.search(r"PER_PAGE\s*=\s*(\d+)", SRC).group(1))
    ppf = int(re.search(r"PAGES_PER_FILE\s*=\s*(\d+)", SRC).group(1))
    num = int(re.search(r"NUM_SITEMAPS\s*=\s*(\d+)", SRC).group(1))
    assert num >= 2, "至少應拆成 2 個子檔"
    assert num * per * ppf >= 55000, "分片總容量應覆蓋約 55k 商家"
