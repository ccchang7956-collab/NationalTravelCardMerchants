export const escapeHtml = (unsafe: string): string => {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

export const sanitizeUrl = (url: string): string => {
  const trimmed = url.trim();
  if (/^(https?:\/\/)/i.test(trimmed)) {
    return trimmed;
  }
  // 阻斷 javascript:, data:, vbscript: 注入
  if (/^(javascript:|data:|vbscript:)/i.test(trimmed)) {
    return "about:blank";
  }
  return "http://" + trimmed;
};
