import { test, expect } from "@playwright/test";
import { signupAndVerify, walkOnboardingToDashboard } from "./helpers";

test("signup lands in guarded app shell", async ({ page }) => {
  await signupAndVerify(page, "Koperasi E2E", `e2e-${Date.now()}@test.id`);
  await walkOnboardingToDashboard(page, { businessName: "Koperasi E2E" });
  await expect(page.getByText("Jurnal Umum")).toBeVisible();
});

test("unauthenticated access redirects to masuk", async ({ page }) => {
  await page.goto("/jurnal");
  await expect(page).toHaveURL(/\/masuk/);
});

test("statements render after direct visit", async ({ page }) => {
  // fresh signup for isolation
  const email = `e2e-${Date.now()}@test.id`;
  await signupAndVerify(page, "Koperasi E2E Dua", email);
  await walkOnboardingToDashboard(page, { businessName: "Koperasi E2E Dua" });

  await page.goto("/laporan/neraca");
  await expect(page.getByRole("heading", { name: "Neraca" })).toBeVisible();
  await expect(page.getByText("Laba Tahun Berjalan", { exact: true })).toBeVisible();
  await expect(page.getByText("Total Aset")).toBeVisible();

  await page.goto("/laporan/laba-rugi");
  await expect(page.getByText("Laba Bersih")).toBeVisible();
});
