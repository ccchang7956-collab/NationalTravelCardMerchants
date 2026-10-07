export const MERCHANT_CATEGORIES = [
  { slug: "accommodation", name: "住宿", code: "55", explanation: "依稅籍行業別住宿業整理，包含旅館、民宿等住宿服務。" },
  { slug: "dining", name: "餐飲", code: "56", explanation: "依稅籍行業別餐飲業整理，包含餐廳、小吃及飲料店等餐飲服務。" },
] as const;
export function merchantCategory(slug: string) {
  return MERCHANT_CATEGORIES.find(category => category.slug === slug);
}
export function paginationPages(page: number, total: number): number[] {
  // Nearby pages plus ten-page jumps make long directories traversable.
  return [...new Set([1, total, page, page - 1, page + 1, page - 10, page + 10])]
    .filter(value => value >= 1 && value <= total).sort((a, b) => a - b);
}
