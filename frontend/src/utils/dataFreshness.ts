// 資料新鮮度附註：排程每天檢查官方清冊，無變更也會留下 last_checked。
// 有當日檢查記錄就顯示狀態，使用者不再把「無新資料」誤認成「排程壞掉」。
export function freshnessNote(
  lastChecked?: string | null,
  result?: string | null
): string {
  if (!lastChecked) return "";
  if (result === "failed") return "（最近檢查失敗，顯示既有資料）";
  // last_checked 是 +08:00 ISO，前 10 碼即台北日期；同樣基準算今天
  const todayTaipei = new Date(Date.now() + 8 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  const checked = new Date(lastChecked);
  if (!Number.isFinite(checked.getTime())) return "";
  const checkedTaipei = new Date(checked.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  if (checkedTaipei !== todayTaipei) return "";
  if (result === "skipped_no_change") return "（今日已檢查，無新資料）";
  if (result === "updated") return "（今日已更新）";
  return "";
}
