/**
 * 統一存取後端 API URL 的 Helper 函式
 * 區分 Server Component (Node.js/Docker 內部網路) 與 Client Component (瀏覽器前端)
 */

export function getBackendUrl(): string {
  // 如果運行在伺服器端 (Server Component / Route Handler / Metadata)
  if (typeof window === "undefined") {
    return (
      process.env.INTERNAL_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://127.0.0.1:8000"
    );
  }
  // 如果運行在用戶端瀏覽器 (Client Component)
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
}

export function getPublicApiUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
}
