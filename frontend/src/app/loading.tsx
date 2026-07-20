import { BuildingStorefrontIcon } from "@heroicons/react/24/outline";

export default function Loading() {
  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Search Header Skeleton */}
      <div className="bg-card-bg border border-border-color rounded-2xl p-6 md:p-8 shadow-sm space-y-4">
        <div className="h-7 w-48 bg-muted-bg rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="h-11 bg-muted-bg rounded-xl animate-pulse md:col-span-2" />
          <div className="h-11 bg-muted-bg rounded-xl animate-pulse" />
          <div className="h-11 bg-accent/20 rounded-xl animate-pulse" />
        </div>
      </div>

      {/* Cards Skeleton Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-5 w-32 bg-muted-bg rounded animate-pulse" />
          <div className="h-5 w-24 bg-muted-bg rounded animate-pulse" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-card-bg border border-border-color rounded-2xl p-5 space-y-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2 flex-1">
                  <div className="h-6 w-3/4 bg-muted-bg rounded animate-pulse" />
                  <div className="h-4 w-1/2 bg-muted-bg/60 rounded animate-pulse" />
                </div>
                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                  <BuildingStorefrontIcon className="w-5 h-5 text-accent animate-pulse" />
                </div>
              </div>
              <div className="space-y-2 pt-2 border-t border-border-color/50">
                <div className="h-4 w-5/6 bg-muted-bg/50 rounded animate-pulse" />
                <div className="h-4 w-2/3 bg-muted-bg/40 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
