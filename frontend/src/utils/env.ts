/**
 * 統一存取後端 API URL 的 Helper 函式
 * 區分 Server Component (Node.js/Docker 內部網路) 與 Client Component (瀏覽器前端)
 */

/** 移除尾端所有 `/`（保留 `http://` 的 `//`） */
function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "" ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  );
}

export function getBackendUrl(base?: string, opts?: { hostname?: string }): string {
  const raw =
    base ??
    (typeof window === "undefined"
      ? process.env.INTERNAL_API_URL ||
        process.env.NEXT_PUBLIC_API_URL ||
        "http://127.0.0.1:8000"
      : process.env.NEXT_PUBLIC_API_URL);
  // 如果運行在伺服器端 (Server Component / Route Handler / Metadata)
  if (typeof window === "undefined") {
    return stripTrailingSlash(
      raw || "http://127.0.0.1:8000"
    );
  }
  // 如果運行在用戶端瀏覽器 (Client Component)
  if (raw) {
    return stripTrailingSlash(raw);
  }
  // NEXT_PUBLIC_API_URL 未設：localhost 沿用預設，非 localhost 用當前 hostname fallback
  const hostname = opts?.hostname ?? window.location.hostname;
  if (isLocalHostname(hostname)) {
    return "http://localhost:8000";
  }
  console.warn(
    `NEXT_PUBLIC_API_URL 未設定，改用目前主機名稱 fallback: http://${hostname}:8000`
  );
  return `http://${hostname}:8000`;
}

export function getPublicApiUrl(base?: string, opts?: { hostname?: string }): string {
  const raw = base ?? process.env.NEXT_PUBLIC_API_URL;
  if (raw) {
    return stripTrailingSlash(raw);
  }
  if (typeof window !== "undefined") {
    const hostname = opts?.hostname ?? window.location.hostname;
    if (!isLocalHostname(hostname)) {
      console.warn(
        `NEXT_PUBLIC_API_URL 未設定，改用目前主機名稱 fallback: http://${hostname}:8000`
      );
      return `http://${hostname}:8000`;
    }
  }
  return "http://localhost:8000";
}
