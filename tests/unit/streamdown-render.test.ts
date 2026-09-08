import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { Streamdown } from "streamdown";

function render(md: string, isAnimating = false): string {
  return renderToStaticMarkup(createElement(Streamdown, { isAnimating }, md));
}

describe("streamdown assistant markdown", () => {
  it("teks streaming + kursor tetap terformat hidup", () => {
    const html = render("**Laba** bulan ini:\n\n- Kas naik▍", true);
    expect(html).toContain('data-streamdown="strong"');
    expect(html).toContain("▍");
  });
  it("render bold, list, dan tabel GFM", () => {
    const html = render("**Laba** bulan ini:\n\n- Kas naik\n\n| Metrik | Nilai |\n|---|---|\n| ROA | 12% |\n");
    expect(html).toContain('data-streamdown="strong"');
    expect(html).toContain('data-streamdown="list-item"');
    expect(html).toContain('data-streamdown="table"');
    expect(html).toContain("ROA");
  });
  it("sintaks tak lengkap saat streaming tidak crash", () => {
    expect(() => render("**Laba belum tutup")).not.toThrow();
    expect(() => render("```ts\nconst a = 1;")).not.toThrow();
    expect(() => render("[klik sini")).not.toThrow();
  });
  it("strip tag script mentah (sanitize bawaan)", () => {
    const html = render('halo <script>alert("x")</script> dunia');
    expect(html).not.toContain("<script>");
    expect(html).toContain("dunia");
  });
});
