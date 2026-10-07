import Link from "next/link";
import { CITIES, cityPageUrl } from "@/utils/cities";

type Props = { counts?: { city: string; count: number }[] };

export default function CityDirectory({ counts }: Props) {
  return (
    <section aria-labelledby="city-directory-title" className="space-y-4">
      <h2 id="city-directory-title" className="text-xl font-medium">依縣市查詢國旅卡特約商店</h2>
      <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {CITIES.map((city) => {
          const count = counts?.find((item) => item.city.replaceAll("臺", "台") === city.name)?.count;
          return (
            <li key={city.slug}>
              <Link href={cityPageUrl(city.slug)} prefetch={false} className="block rounded-xl border border-border bg-card p-4 hover:border-accent hover:text-accent">
                {city.name}特約商店
                {count !== undefined && <span className="block mt-1 text-sm text-muted">{count.toLocaleString()} 間</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
