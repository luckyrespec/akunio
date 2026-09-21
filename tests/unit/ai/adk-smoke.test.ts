import { describe, it, expect } from "vitest";
import { LlmAgent, FunctionTool } from "@google/adk";
import { z } from "zod";

describe("adk smoke", () => {
  it("LlmAgent + FunctionTool terkontruksi tanpa network", () => {
    const tool = new FunctionTool({
      name: "ping",
      description: "ping",
      parameters: z.object({}),
      execute: async () => ({ status: "ok" }),
    });
    const agent = new LlmAgent({
      name: "smoke",
      model: "gemini-flash-latest",
      instruction: "Balas singkat.",
      tools: [tool],
    });
    expect(agent.name).toBe("smoke");
  });
});
