import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";

export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center py-32 space-y-4 animate-in fade-in duration-500">
      <MagnifyingGlassIcon className="w-12 h-12 text-muted animate-pulse" />
      <p className="text-lg text-muted font-medium animate-pulse">正在為您搜尋特約商店...</p>
    </div>
  );
}
