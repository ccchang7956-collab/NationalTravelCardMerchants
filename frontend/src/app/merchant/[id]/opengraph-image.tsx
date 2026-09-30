import { ImageResponse } from "@vercel/og";

export const runtime = "edge";
export const alt = "國民旅遊卡特約商店詳情";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const API_URL =
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://127.0.0.1:8000";
  const { id } = await params;

  let name = "國民旅遊卡特約商店";
  let address = "";
  let cityBadge = "";

  try {
    const res = await fetch(`${API_URL}/api/merchants/${id}`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const merchant = await res.json();
      name = merchant.name || name;
      address = merchant.address || "";
      cityBadge = address ? address.substring(0, 3) : "";
    }
  } catch {
    // fallback to defaults
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #1a1a2e 0%, #2d2d4e 100%)",
          padding: "80px",
          position: "relative",
        }}
      >
        {/* 品牌角落 */}
        <div
          style={{
            position: "absolute",
            top: "48px",
            right: "64px",
            fontSize: "16px",
            color: "rgba(255,255,255,0.5)",
            letterSpacing: "2px",
          }}
        >
          國旅卡特約商店查詢
        </div>

        {/* 縣市 badge */}
        {cityBadge && (
          <div
            style={{
              display: "flex",
              marginBottom: "32px",
            }}
          >
            <div
              style={{
                background: "#C25E40",
                color: "#fff",
                padding: "8px 20px",
                borderRadius: "99px",
                fontSize: "20px",
                fontWeight: "600",
              }}
            >
              {cityBadge}
            </div>
          </div>
        )}

        {/* 商家名稱 */}
        <div
          style={{
            fontSize: name.length > 15 ? "48px" : "64px",
            fontWeight: "700",
            color: "#FFFFFF",
            lineHeight: "1.2",
            maxWidth: "900px",
            flex: 1,
            display: "flex",
            alignItems: "center",
          }}
        >
          {name}
        </div>

        {/* 地址 */}
        {address && (
          <div
            style={{
              fontSize: "22px",
              color: "rgba(255,255,255,0.65)",
              marginBottom: "16px",
            }}
          >
            📍 {address}
          </div>
        )}

        {/* 確認標記 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            background: "rgba(194,94,64,0.2)",
            border: "1px solid rgba(194,94,64,0.5)",
            borderRadius: "12px",
            padding: "16px 24px",
            width: "fit-content",
          }}
        >
          <div style={{ fontSize: "24px", color: "#C25E40", fontWeight: "700" }}>
            ✓
          </div>
          <div style={{ fontSize: "22px", color: "rgba(255,255,255,0.9)" }}>
            國民旅遊卡官方認定特約商店
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
