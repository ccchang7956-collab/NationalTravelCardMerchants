/** JSON-LD 安全序列化：阻斷 </script> 閉合注入（儲存型 XSS）。 */
export function escapeJsonLd(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}
