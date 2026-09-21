import { describe, it, expect } from "vitest";
import type { Context } from "@google/adk";
import { buildFunctionTool } from "@/server/ai/agents/adk-tools";

describe("adk-tools approval gate", () => {
  it("toolContext tak tersedia + approval dibutuhkan → lempar fail-loud", async () => {
    const tool = buildFunctionTool("org-x", "a@b.c", "post_journal");
    await expect(
      tool.runAsync({
        args: {
          lines: [
            { accountCode: "6210", debitText: "100000", creditText: "" },
            { accountCode: "1110", debitText: "", creditText: "100000" },
          ],
        },
        toolContext: undefined as unknown as Context,
      }),
    ).rejects.toThrow(/ToolContext tak tersedia untuk approval/);
  });
});
