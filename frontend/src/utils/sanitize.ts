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
  // 拒絕含空白/control char（href 上下文可被解析為怪異 URL）
  if (/[\s\u0000-\u001f\u007f]/.test(trimmed)) {
    return "about:blank";
  }
  if (/^(https?:\/\/)/i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      if (u.protocol === "http:" || u.protocol === "https:") return trimmed;
    } catch {
      // fallthrough to blank
    }
    return "about:blank";
  }
  // 阻斷 javascript:, data:, vbscript: 注入
  if (/^(javascript:|data:|vbscript:)/i.test(trimmed)) {
    return "about:blank";
  }
  // 阻斷 protocol-relative //evil.com
  if (trimmed.startsWith("//")) {
    return "about:blank";
  }
  const prefixed = "http://" + trimmed;
  if (/[\s\u0000-\u001f\u007f]/.test(prefixed)) return "about:blank";
  try {
    const u = new URL(prefixed);
    if (u.protocol === "http:" || u.protocol === "https:") return prefixed;
  } catch {
    return "about:blank";
  }
  return "about:blank";
};
