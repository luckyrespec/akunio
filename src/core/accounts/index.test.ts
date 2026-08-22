import { describe, it, expect } from "vitest";
import { COA_TEMPLATE, validateTemplate, buildCoa } from "./index";

describe("coa template", () => {
  it("is valid", () => {
    expect(validateTemplate(COA_TEMPLATE)).toEqual([]);
  });
  it("rejects duplicate codes", () => {
    const dup = [...COA_TEMPLATE, { ...COA_TEMPLATE[1] }];
    expect(validateTemplate(dup)).toContain("DUPLICATE_CODE");
  });
  it("rejects missing parent", () => {
    const bad = [{ code: "9999", name: "Yatim", type: "ASET", normal: "D", parentCode: "8888" }] as const;
    expect(validateTemplate(bad as never)).toContain("PARENT_NOT_FOUND");
  });
  it("normal balance must match type unless contra", () => {
    const bad = [{ code: "9100", name: "Kas Aneh", type: "ASET", normal: "K" }] as const;
    expect(validateTemplate(bad as never)).toContain("NORMAL_MISMATCH");
  });
  it("builds map by code", () => {
    const map = buildCoa(COA_TEMPLATE);
    expect(map.get("1100")?.name).toBe("Kas dan Setara Kas");
    expect(map.size).toBe(COA_TEMPLATE.length);
  });
});
