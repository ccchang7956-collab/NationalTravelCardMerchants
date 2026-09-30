/**
 * Phase4 Task4: MapView 選店連動 + API_URL 解凍
 * TDD: 實作前 FAIL，實作後 PASS（源碼契約測試，沿用 Phase3 模式）
 */
import fs from "fs";
import path from "path";

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(__dirname, rel), "utf8");
}

describe("Phase4 Task4: MapView 選店連動（flyTo + openPopup）", () => {
  const src = () => readSrc("../components/MapView.tsx");

  it("selectedMerchant 有解構並驅動 useEffect", () => {
    const s = src();
    // props 解構必須取出 selectedMerchant（否則側欄選店無法連動）
    expect(s).toMatch(/export default function MapView\(\{[\s\S]*?selectedMerchant[\s\S]*?\}\)/);
    // 有以 selectedMerchant 為依賴的 useEffect
    expect(s).toMatch(/useEffect\([\s\S]*?\[selectedMerchant[^\]]*\]\)/);
  });

  it("連動 effect 內含 flyTo 與 openPopup", () => {
    const s = src();
    expect(s).toContain("selectedMerchant.id");
    expect(s).toContain("flyTo");
    expect(s).toContain("openPopup");
  });
});

describe("Phase4 Task4: API_URL 解凍（每次請求時取值）", () => {
  it("map/page.tsx 無模組頂層 const API_URL，fetchNearby 內取值", () => {
    const s = readSrc("../app/map/page.tsx");
    // 模組頂層（行首無縮排）不得凍結 API_URL
    expect(s).not.toMatch(/^const API_URL/m);
    // fetchNearby 函式內每次請求時取值
    expect(s).toMatch(/fetchNearby[\s\S]*?const API_URL = getPublicApiUrl\(\)/);
  });

  it("merchant/[id]/page.tsx 無模組頂層 const API_URL，函式內取值", () => {
    const s = readSrc("../app/merchant/[id]/page.tsx");
    expect(s).not.toMatch(/^const API_URL/m);
    expect(s).toContain("const API_URL = getBackendUrl()");
  });
});
