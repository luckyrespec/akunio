import { test, expect } from "@playwright/test";
import { signupAndVerify, walkOnboardingToDashboard } from "./helpers";

test("persediaan redirect dan child menu", async ({ page }) => {
  const email = `sed${Date.now()}@test.id`;
  await signupAndVerify(page, "Gudang", email);
  await walkOnboardingToDashboard(page);
  await page.goto("/persediaan");
  await page.waitForLoadState("networkidle", { timeout: 30000 });
  await page.waitForTimeout(2000);
  await expect(page).toHaveURL(/\/persediaan\/daftar/, { timeout: 15000 });
  await expect(page.getByRole("heading", { name: /Persediaan/i }).first()).toBeVisible();
});

test("sidebar persediaan punya anak Daftar dan Opname", async ({ page }) => {
  const email = `sed${Date.now()}@test.id`;
  await signupAndVerify(page, "Gudang", email);
  await walkOnboardingToDashboard(page);
  await page.goto("/persediaan/daftar");
  await page.waitForLoadState("networkidle", { timeout: 30000 });
  await page.waitForTimeout(2000);
  await expect(page.getByRole("link", { name: "Daftar Barang", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Stok Opname", exact: true })).toBeVisible();
});
