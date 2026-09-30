"""Phase 4 Task 3: 排程 meta 說真話 — meta.total_merchants 必須是目標庫同步後 COUNT."""
import pathlib

SRC = pathlib.Path("scheduler/update_data.py").read_text()


def test_meta_uses_target_count():
    # brief 要求：meta 前需查目標庫
    assert "SELECT COUNT(*) FROM merchants" in SRC
    # meta.total_merchants 必須取自同步後目標庫查詢結果，而非解析筆數 new_count
    assert "final_total" in SRC, "main() 應查詢同步後目標庫 COUNT 作為 final_total"
    assert '"total_merchants": new_count' not in SRC and "'total_merchants': new_count" not in SRC, \
        "total_merchants 不可直接寫 new_count，必須用目標庫同步後 COUNT"


def test_added_removed_normalized():
    # 增減計算兩側皆需 normalize_tax_id（舊集合讀出後同樣 normalize）
    assert SRC.count("normalize_tax_id") >= 3, \
        "增減兩側與寫入皆需 normalize_tax_id"
    # main() 內舊集合與新集合讀取時必須正規化
    assert "normalize_tax_id(row[0])" in SRC or "normalize_tax_id(row[" in SRC, \
        "old/new tax_id 集合讀出後應經 normalize_tax_id"
