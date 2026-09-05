import { test, expect } from "@playwright/test";
import { signupAndVerify, walkOnboardingToDashboard } from "./helpers";

test("pembayaran tercatat dan muncul di list", async ({ page }) => {
  const email = `kas${Date.now()}@test.id`;
  await signupAndVerify(page, "Kasir", email);
  await walkOnboardingToDashboard(page);
  await page.goto("/kas-bank/pembayaran");
  await page.getByRole("button", { name: "Tambah Pembayaran" }).click();
  await page.getByRole("button", { name: "Gaji", exact: true }).click();
  await page.getByTestId("kas-bank-amount").fill("150000");
  await page.getByTestId("kas-bank-memo").fill("ATK e2e");
  await page.getByTestId("kas-bank-submit-post").click();
  await expect(page.getByTestId("kas-bank-row").first()).toBeVisible({
    timeout: 15000,
  });
});
