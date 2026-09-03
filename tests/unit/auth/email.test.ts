import { describe, it, expect, vi, afterEach } from "vitest";

describe("sendAuthEmail", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("logs the verification URL in dev when no provider is configured", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("RESEND_API_KEY", "");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { sendAuthEmail } = await import("@/server/auth/email");
    await sendAuthEmail("verification", { email: "a@b.id", name: "A" }, "http://x/verify?t=1");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("http://x/verify?t=1"));
  });

  it("throws in production without a provider so misconfig ships loudly", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "");
    const { sendAuthEmail } = await import("@/server/auth/email");
    await expect(
      sendAuthEmail("verification", { email: "a@b.id" }, "http://x/verify?t=1"),
    ).rejects.toThrow("RESEND_API_KEY");
  });
});
