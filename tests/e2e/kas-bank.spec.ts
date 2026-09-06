import { test, expect } from "@playwright/test";
import { signupAndVerify, walkOnboardingToDashboard } from "./helpers";

test("pembayaran tercatat dan mendarat di detail", async ({ page }) => {
  const email = `kas${Date.now()}@test.id`;
  await signupAndVerify(page, "Kasir", email);
  await walkOnboardingToDashboard(page);
  await page.goto("/kas-bank/pembayaran");
  await page.waitForLoadState("networkidle", { timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.getByRole("link", { name: "Tambah Pembayaran" }).click();
  await expect(page).toHaveURL(/\/kas-bank\/pembayaran\/baru/, {
    timeout: 15000,
  });
  await page.getByRole("button", { name: "Gaji", exact: true }).click();
  await page.getByTestId("kas-bank-amount").fill("150000");
  await page.getByTestId("kas-bank-memo").fill("ATK e2e");
  await page.getByTestId("kas-bank-submit-post").click();
  await expect(page).toHaveURL(/\/kas-bank\/pembayaran\/[0-9a-f-]{36}/, {
    timeout: 15000,
  });
  await expect(page.getByText("BBK-", { exact: false }).first()).toBeVisible();
});
