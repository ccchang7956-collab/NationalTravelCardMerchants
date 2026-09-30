/**
 * Phase4 Task5: page.tsx 防禦與 a11y
 * TDD: 實作前 FAIL，實作後 PASS（源碼契約測試，沿用 Phase4 模式）
 */
import fs from "fs";
import path from "path";

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(__dirname, rel), "utf8");
}

describe("Phase4b Task5: page.tsx 型別上移 + 數字/字串防禦 + q 截斷 + 分頁 a11y", () => {
  const src = () => readSrc("../app/page.tsx");

  it("CityStat/Merchant interface 定義在組件外（export default function Home 之前）", () => {
    const s = src();
    const homeIdx = s.indexOf("export default async function Home");
    expect(homeIdx).toBeGreaterThan(-1);
    const cityIdx = s.indexOf("interface CityStat");
    const merchantIdx = s.indexOf("interface Merchant");
    expect(cityIdx).toBeGreaterThan(-1);
    expect(merchantIdx).toBeGreaterThan(-1);
    // 介面必須出現在組件之前，而非函式體內
    expect(cityIdx).toBeLessThan(homeIdx);
    expect(merchantIdx).toBeLessThan(homeIdx);
  });

  it("stats 顯示使用 Number(stats?.total_merchants ?? 0) 防禦", () => {
    const s = src();
    expect(s).toContain("Number(stats?.total_merchants");
    // 不得再有裸 stats.total_merchants.toLocaleString()（無防禦寫法）
    expect(s).not.toMatch(/(?<!Number\()stats\.total_merchants\.toLocaleString\(\)/);
  });

  it("merchant 地址欄位使用 String(m.address ?? \"\") 防禦", () => {
    const s = src();
    expect(s).toContain('String(m.address');
  });

  it("generateMetadata 與內文 q 皆截斷 q.slice(0, 50)", () => {
    const s = src();
    const matches = s.match(/q\.slice\(0,\s*50\)/g) || [];
    // generateMetadata 一處 + 內文一處，至少兩處
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("分頁上一頁/下一頁 Link 含 aria-label", () => {
    const s = src();
    expect(s).toContain('aria-label="上一頁"');
    expect(s).toContain('aria-label="下一頁"');
  });

  it("搜尋框保留 maxLength=100（未被移除）", () => {
    const s = readSrc("../components/HomeSearchSection.tsx");
    expect(s).toMatch(/maxLength=\{100\}/);
  });
});
