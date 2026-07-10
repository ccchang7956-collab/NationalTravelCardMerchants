/* eslint-disable */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

function loadTsModule(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  // 簡單的 TypeScript 到 JavaScript 轉換
  const jsContent = content
    .replace(/:\s*string/g, "")
    .replace(/export\s+/g, "");
  
  const exports = {};
  const fn = new Function("exports", jsContent + "\nexports.escapeHtml = escapeHtml;\nexports.sanitizeUrl = sanitizeUrl;");
  fn(exports);
  return exports;
}

console.log("🧪 執行前端 Sanitization 測試...");

const tsPath = path.join(__dirname, "../src/utils/sanitize.ts");
const { escapeHtml, sanitizeUrl } = loadTsModule(tsPath);

try {
  // Test HTML Escaping
  assert.strictEqual(escapeHtml("<div>test</div>"), "&lt;div&gt;test&lt;/div&gt;");
  assert.strictEqual(escapeHtml('Joe"s Cafe & Bar'), "Joe&quot;s Cafe &amp; Bar");
  assert.strictEqual(escapeHtml("<script>alert(1)</script>"), "&lt;script&gt;alert(1)&lt;/script&gt;");

  // Test URL Sanitization
  assert.strictEqual(sanitizeUrl("https://example.com"), "https://example.com");
  assert.strictEqual(sanitizeUrl("javascript:alert(document.cookie)"), "about:blank");
  assert.strictEqual(sanitizeUrl("www.google.com"), "http://www.google.com");
  assert.strictEqual(sanitizeUrl("  http://test.tw  "), "http://test.tw");

  console.log("✅ 前端 Sanitization 測試全數通過！");
} catch (error) {
  console.error("❌ 測試失敗！");
  console.error(error);
  process.exit(1);
}
