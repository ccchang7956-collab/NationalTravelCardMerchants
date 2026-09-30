import { ImageResponse } from "@vercel/og";

export const runtime = "edge";
export const alt = "國民旅遊卡特約商店查詢";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function TwitterImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #C25E40 0%, #8B3A25 100%)",
          padding: "80px",
        }}
      >
        <div
          style={{
            background: "rgba(255,255,255,0.12)",
            border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: "24px",
            padding: "60px 80px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "24px",
          }}
        >
          <div
            style={{
              fontSize: "20px",
              color: "rgba(255,255,255,0.8)",
              letterSpacing: "4px",
              textTransform: "uppercase",
            }}
          >
            National Travel Card
          </div>
          <div
            style={{
              fontSize: "56px",
              fontWeight: "700",
              color: "#FFFFFF",
              textAlign: "center",
              lineHeight: "1.2",
            }}
          >
            國民旅遊卡
            <br />
            特約商店查詢
          </div>
          <div
            style={{
              fontSize: "28px",
              color: "rgba(255,255,255,0.85)",
              textAlign: "center",
            }}
          >
            收錄 55,000+ 間全台特約商店
          </div>
          <div
            style={{
              fontSize: "18px",
              color: "rgba(255,255,255,0.65)",
              textAlign: "center",
            }}
          >
            支援店名、縣市、行業類別搜尋 · 地圖定位查詢
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
