export const CITIES = [
  { slug: "keelung", name: "基隆市" },
  { slug: "taipei", name: "台北市" },
  { slug: "new-taipei", name: "新北市" },
  { slug: "taoyuan", name: "桃園市" },
  { slug: "hsinchu-city", name: "新竹市" },
  { slug: "hsinchu-county", name: "新竹縣" },
  { slug: "miaoli", name: "苗栗縣" },
  { slug: "taichung", name: "台中市" },
  { slug: "changhua", name: "彰化縣" },
  { slug: "nantou", name: "南投縣" },
  { slug: "yunlin", name: "雲林縣" },
  { slug: "chiayi-city", name: "嘉義市" },
  { slug: "chiayi-county", name: "嘉義縣" },
  { slug: "tainan", name: "台南市" },
  { slug: "kaohsiung", name: "高雄市" },
  { slug: "pingtung", name: "屏東縣" },
  { slug: "yilan", name: "宜蘭縣" },
  { slug: "hualien", name: "花蓮縣" },
  { slug: "taitung", name: "台東縣" },
  { slug: "penghu", name: "澎湖縣" },
  { slug: "kinmen", name: "金門縣" },
  { slug: "lienchiang", name: "連江縣" },
] as const;

export function cityBySlug(slug: string) {
  return CITIES.find((city) => city.slug === slug);
}

export function cityFromAddress(address?: string | null, cityName?: string | null) {
  const name = cityName?.trim().replaceAll("臺", "台");
  const normalizedAddress = address?.trim().replaceAll("臺", "台");
  return CITIES.find((city) => city.name === name)
    ?? CITIES.find((city) => normalizedAddress?.startsWith(city.name));
}

export function cityPageNumber(value: string | string[] | undefined): number | null {
  if (value === undefined) return 1;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const page = Number(value);
  return Number.isSafeInteger(page) && page <= 10000 ? page : null;
}

export function cityPageUrl(slug: string, page = 1, category?: string): string {
  return `/city/${slug}${category ? `/${category}` : ""}${page > 1 ? `?page=${page}` : ""}`;
}
