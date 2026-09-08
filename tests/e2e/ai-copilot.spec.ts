import { test, expect } from "@playwright/test";
import { signupAndVerify, walkOnboardingToDashboard } from "./helpers";

async function signup(page: import("@playwright/test").Page) {
  await signupAndVerify(page, "Koperasi AI E2E", `e2e-ai-${Date.now()}@test.id`);
  await walkOnboardingToDashboard(page, { businessName: "Koperasi AI E2E" });
}

test("Akunio answers a question via streaming chat", async ({ page }) => {
  // Live-AI smoke for the unified /asisten UI (agent-first redesign retired
  // the m2 inline "Draft Jurnal" card; tool-approval flows are covered by
  // integration tests in tests/integration/nara-*.test.ts — tool API internal masih bernama nara).
  test.setTimeout(180_000);
  await signup(page);
  await page.goto("/asisten");
  await page.waitForSelector('body[data-asisten-ready="1"]', { timeout: 30000 });
  // Akunio chat input (controlled PromptInputTextarea: real keystrokes, not fill)
  const input = page.getByPlaceholder(/Tanya Akunio|Tanya/);
  await input.click();
  const q = "Apa itu aset lancar dalam satu kalimat?";
  await input.pressSequentially(q, { delay: 10 });
  await expect(input).toHaveValue(q, { timeout: 10000 });
  await page.getByRole("button", { name: "Kirim" }).click();
  // User echo proves the send path persisted the message.
  await expect(page.getByText(q).first()).toBeVisible({ timeout: 15000 });
  // Assistant block appears once streaming starts; thinking indicator
  // detaches only when the live response completes.
  await expect(page.locator('[data-from="assistant"]')).not.toHaveCount(0, { timeout: 120000 });
  await expect(
    page.getByRole("status", { name: "Akunio sedang berpikir" }),
  ).toBeHidden({ timeout: 120000 });
});

test("sidebar shows Akunio enabled and /jurnal/ai redirects", async ({ page }) => {
  await signup(page);
  await page.goto("/dasbor");
  await page.getByRole("link", { name: /Asisten Akunio/ }).click();
  await expect(page).toHaveURL(/\/asisten/);
  await expect(page.getByRole("heading", { name: /Mulai pencatatan atau konsultasi/ })).toBeVisible();
  await page.goto("/jurnal/ai");
  await expect(page).toHaveURL(/\/asisten/);
});
