import { freshnessNote } from "./dataFreshness";

function todayTaipeiIso(): string {
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  return `${today}T03:00:00+08:00`;
}

describe("freshnessNote", () => {
  it("今日檢查無變更顯示附註", () => {
    expect(freshnessNote(todayTaipeiIso(), "skipped_no_change")).toBe(
      "（今日已檢查，無新資料）"
    );
  });

  it("今日有更新顯示附註", () => {
    expect(freshnessNote(todayTaipeiIso(), "updated")).toBe("（今日已更新）");
  });

  it("昨日的檢查不顯示（避免舊附註殘留）", () => {
    const yesterday = new Date(Date.now() + 8 * 3600 * 1000 - 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    expect(
      freshnessNote(`${yesterday}T03:00:00+08:00`, "skipped_no_change")
    ).toBe("");
  });

  it("無記錄顯示空字串", () => {
    expect(freshnessNote(null, null)).toBe("");
    expect(freshnessNote(undefined, undefined)).toBe("");
  });
});
