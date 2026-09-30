"""Phase 5 Task 3: sitemap 分頁上限 + 真實 lastModified。

驗收：
- sitemap.ts 有 MAX_PAGES 分頁上限（單檔 50000 URL 上限內分頁抓取）。
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
    # 失敗必須 break（!res.ok break 或 catch 內 break/return）
    assert "break" in SRC, "抓取失敗應 break，避免無限迴圈"
