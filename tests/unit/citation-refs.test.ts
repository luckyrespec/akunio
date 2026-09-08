import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Streamdown } from "streamdown";
import { parseCitationHref, assistantRehypePlugins } from "@/components/ai-elements/citation-refs";

describe("parseCitationHref", () => {
  it("sak:bab:paragraf", () => {
    expect(parseCitationHref("sak:11:11.1-11.3")).toEqual({
      kind: "sak",
      bab: "11",
      paragraph: "11.1-11.3",
    });
  });
  it("sak tanpa paragraf", () => {
    expect(parseCitationHref("sak:8:")).toEqual({ kind: "sak", bab: "8", paragraph: "" });
  });
  it("jurnalirr nomor entri", () => {
    expect(parseCitationHref("jurnal:JE-2026-0004")).toEqual({
      kind: "jurnal",
      number: "JE-2026-0004",
    });
  });
  it("http biasa tetap eksternal", () => {
    expect(parseCitationHref("https://example.com/x")).toEqual({
      kind: "external",
      href: "https://example.com/x",
    });
  });
  it("skema asing diperlakukan aman sebagai eksternal", () => {
    expect(parseCitationHref("javascript:alert(1)")).toEqual({
      kind: "external",
      href: "javascript:alert(1)",
    });
  });
});

describe("sak: href lolos sanitize streamdown", () => {
  it("href sak: dipertahankan dengan konfigurasi app + komponen a kustom", () => {
    const html = renderToStaticMarkup(
      createElement(
        Streamdown,
        {
          rehypePlugins: assistantRehypePlugins as never,
          components: {
            a: (props: { href?: string; children?: React.ReactNode }) =>
              createElement("a", { href: props.href, "data-cite": "1" }, props.children),
          },
        } as never,
        "[SAK Bab 11](sak:11:11.1-11.3)",
      ),
    );
    expect(html).toContain('href="sak:11:11.1-11.3"');
    expect(html).toContain("SAK Bab 11");
  });
});
