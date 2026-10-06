import { escapeJsonLd } from "@/utils/jsonld";
import { sanitizeUrl } from "@/utils/sanitize";

describe("CriticalReviewFixes", () => {
  test("escapeJsonLd neutralizes </script>", () => {
    const obj = { name: "</script><script>alert(1)</script>" };
    const s = escapeJsonLd(obj);
    expect(s).not.toContain("</script>");
    expect(s).toContain("\\u003c");
    expect(JSON.parse(s.replace(/\\u003c/g, "<"))).toEqual(obj);
  });

  test("sanitizeUrl rejects whitespace/control and protocol-relative", () => {
    expect(sanitizeUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(sanitizeUrl("javascript:alert(1)")).toBe("about:blank");
    expect(sanitizeUrl("https://evil.com/\njavascript:alert(1)")).toBe("about:blank");
    expect(sanitizeUrl("//evil.com/x")).not.toContain("//evil.com");
  });
});
