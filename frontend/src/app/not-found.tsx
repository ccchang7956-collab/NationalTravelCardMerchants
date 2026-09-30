import Link from "next/link";

const POPULAR_CITIES = ["台北市", "新北市", "台中市", "高雄市"];

export default function NotFound() {
  return (
    <div className="text-center py-16 px-4 space-y-6 animate-in fade-in duration-500">
      <div className="space-y-2">
        <p className="text-sm text-muted">404</p>
        <h1 className="text-3xl font-medium tracking-tight text-foreground">
          找不到這個頁面
        </h1>
        <p className="text-sm text-muted max-w-md mx-auto">
          您要查看的頁面不存在或已被移除，試試熱門縣市的特約商店查詢。
        </p>
      </div>
      <div>
        <Link
          href="/"
          className="inline-flex items-center px-4 py-2 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors shadow-sm"
        >
          回首頁
        </Link>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
        {POPULAR_CITIES.map((city) => (
          <Link
            key={city}
            href={`/?city=${city}`}
            className="px-3 py-1.5 rounded-lg bg-card border border-border hover:border-accent/50 hover:text-accent transition-colors"
          >
            {city}特約商店
          </Link>
        ))}
      </div>
    </div>
  );
}
