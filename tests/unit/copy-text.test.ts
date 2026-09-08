import { afterEach, describe, expect, it, vi } from "vitest";
import { copyTextToClipboard } from "@/components/ai-elements/copy-text";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("copyTextToClipboard", () => {
  it("true bila clipboard API berhasil", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await expect(copyTextToClipboard("halo")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("halo");
  });
  it("false bila clipboard API melempar", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    vi.stubGlobal("document", undefined);
    await expect(copyTextToClipboard("halo")).resolves.toBe(false);
  });
  it("false tanpa navigator/document (lingkungan non-browser)", async () => {
    vi.stubGlobal("navigator", undefined);
    vi.stubGlobal("document", undefined);
    await expect(copyTextToClipboard("halo")).resolves.toBe(false);
  });
});
