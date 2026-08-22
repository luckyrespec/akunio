import type { AccountDef, NormalBalance } from "./types";
import { DEFAULT_NORMAL } from "./types";

export * from "./types";
export { COA_TEMPLATE } from "./coa-template";

export function validateTemplate(defs: readonly AccountDef[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const d of defs) {
    if (!/^\d{4}$/.test(d.code)) errors.push(`BAD_CODE`);
    if (seen.has(d.code)) errors.push(`DUPLICATE_CODE`);
    seen.add(d.code);
  }
  for (const d of defs) {
    if (d.parentCode && !defs.some((p) => p.code === d.parentCode))
      errors.push(`PARENT_NOT_FOUND`);
  }
  for (const d of defs) {
    if (d.parentCode) {
      const p = defs.find((x) => x.code === d.parentCode);
      if (p && p.type !== d.type) errors.push(`PARENT_TYPE_MISMATCH`);
    }
    const expected: NormalBalance = d.contra
      ? DEFAULT_NORMAL[d.type] === "D" ? "K" : "D"
      : DEFAULT_NORMAL[d.type];
    if (d.normal !== expected) errors.push(`NORMAL_MISMATCH`);
  }
  return errors;
}

export function buildCoa(defs: readonly AccountDef[]): Map<string, AccountDef> {
  return new Map(defs.map((d) => [d.code, d]));
}
