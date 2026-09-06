import { test, expect } from "@playwright/test";
import { signupAndVerify, walkOnboardingToDashboard } from "./helpers";

test("pembayaran tercatat dan muncul di list", async ({ page }) => {
  const email = `kas${Date.now()}@test.id`;
  await signupAndVerify(page, "Kasir", email);
  await walkOnboardingToDashboard(page);
  await page.goto("/kas-bank/pembayaran");
  // Tunggu kompilasi Turbopack + hidrasi selesai sebelum klik (hindari klik mati).
  await page.waitForLoadState("networkidle", { timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: "Tambah Pembayaran" }).click();
  await page.getByRole("button", { name: "Gaji", exact: true }).click();
  await page.getByTestId("kas-bank-amount").fill("150000");
  await page.getByTestId("kas-bank-memo").fill("ATK e2e");
  await page.getByTestId("kas-bank-submit-post").click();
  await expect(page.getByTestId("kas-bank-row").first()).toBeVisible({
    timeout: 15000,
  });
});
