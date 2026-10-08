export default function CachedDataNotice({ fetchedAt }: { fetchedAt: string | null }) {
  if (!fetchedAt) return null;
  return (
    <p role="status" className="rounded-lg bg-amber-50 text-amber-900 border border-amber-200 p-3 text-sm">
      目前顯示先前查詢資料，可能不是最新名單。取得時間：
      <time dateTime={fetchedAt}>{new Date(fetchedAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</time>
      。請在連線恢復後重新搜尋。
    </p>
  );
}
