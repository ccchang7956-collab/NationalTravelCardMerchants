"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div role="alert" className="text-center py-16 px-4 bg-card rounded-2xl border border-border/60 space-y-4">
      <h2 className="text-xl font-semibold">發生錯誤</h2>
      <p className="text-sm text-muted">載入失敗，請稍後重試。{error?.digest ? `（${error.digest}）` : ""}</p>
      <button
        onClick={() => reset()}
        className="inline-flex px-4 py-2 rounded-xl bg-accent text-white text-sm"
      >
        重試
      </button>
    </div>
  );
}
