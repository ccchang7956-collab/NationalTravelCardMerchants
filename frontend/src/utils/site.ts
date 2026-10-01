/**
 * 全站 canonical / sitemap / robots 共用的 Site URL 來源。
 *
 * 正式網域慣例值：https://ntc.example.tw（TODO: 正式網域確定後，
 * 以部署環境變數 NEXT_PUBLIC_SITE_URL 設定，本檔案無需再改）。
 *
 * 注意：必須在函式內呼叫（generateMetadata/route handler/元件內），
 * 禁止模組頂層 const SITE_URL = getSiteUrl()——production 缺 env 時
 * throw 會在 import 期炸掉整站 build。
 */
export function getSiteUrl(): string {
  const u = process.env.NEXT_PUBLIC_SITE_URL;
  if (u) return u.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production")
    throw new Error("NEXT_PUBLIC_SITE_URL must be set in production");
  return "http://localhost:3000";
}
