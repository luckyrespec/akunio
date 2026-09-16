import { test, expect } from "@playwright/test";
import { signupAndVerify, walkOnboardingToDashboard } from "./helpers";

async function signup(page: import("@playwright/test").Page) {
  await signupAndVerify(page, "Koperasi E2E Asisten", `e2e-asb-${Date.now()}@test.id`);
  await walkOnboardingToDashboard(page, { businessName: "Koperasi E2E Asisten" });
}

test("quick access diam saat dibuka (tanpa auto-kirim briefing)", async ({ page }) => {
  await signup(page);
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle");
  const streamPosts: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/nara/chat/stream") && r.method() === "POST") {
      streamPosts.push(r.url());
    }
  });
  await page.getByRole("button", { name: /Buka Asisten Akunio/i }).click();
  await expect(page.getByTestId("assistant-prompt-input")).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(2000);
  expect(streamPosts).toHaveLength(0);
});

test("suggest mengisi prompt tanpa mengirim", async ({ page }) => {
  await signup(page);
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle");
  let streamPosts = 0;
  page.on("request", (r) => {
    if (r.url().includes("/api/nara/chat/stream") && r.method() === "POST") streamPosts += 1;
  });
  await page.getByRole("button", { name: /Buka Asisten Akunio/i }).click();
  const prompt = page.getByTestId("assistant-prompt-input");
  await expect(prompt).toBeVisible({ timeout: 15000 });
  await page.getByText(/Briefing Keuangan Hari Ini/i).first().click();
  await expect(prompt).not.toBeEmpty({ timeout: 5000 });
  expect(streamPosts).toBe(0);
});

test("history sinkron antara /asisten dan quick access", async ({ page }) => {  test.setTimeout(180_000);
  await signup(page);
  await page.goto("/asisten");
  await page.waitForLoadState("networkidle");
  const input = page.getByTestId("assistant-prompt-input");
  await expect(input).toBeVisible({ timeout: 30000 });
  const q = "Sebutkan tiga jenis laporan keuangan dalam satu baris.";
  await input.click();
  await input.pressSequentially(q, { delay: 5 });
  await page.getByRole("button", { name: "Kirim" }).click();
  await expect(page.getByText(q).first()).toBeVisible({ timeout: 15000 });
  const threadTitle = (await page.getByTestId("assistant-thread-item").first().textContent())?.trim();
  expect(threadTitle).toBeTruthy();
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Buka Asisten Akunio/i }).click();
  await expect(page.getByTestId("assistant-prompt-input")).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(threadTitle as string).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("message-copy").first()).toBeVisible({ timeout: 15000 });
});

test("prompt box floating menindih area gulir (bukan mendorong konten)", async ({ page }) => {
  await signup(page);
  await page.goto("/asisten");
  await page.waitForLoadState("networkidle");
  const input = page.getByTestId("assistant-prompt-input");
  await expect(input).toBeVisible({ timeout: 30000 });
  const floatBar = page.getByTestId("assistant-input-float");
  await expect(floatBar).toBeVisible();
  const pos = await floatBar.evaluate((el) => getComputedStyle(el).position);
  expect(pos).toBe("absolute");
  const box = await floatBar.boundingBox();
  const viewport = page.viewportSize();
  expect(box).toBeTruthy();
  expect(viewport).toBeTruthy();
  if (box && viewport) {
    // Menempel di bawah viewport area chat.
    expect(Math.abs(box.y + box.height - viewport.height)).toBeLessThan(4);
  }
});
