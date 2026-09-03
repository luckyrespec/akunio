import { test, expect } from "@playwright/test";
import { signupAndVerify, walkOnboardingToDashboard } from "./helpers";

test("daftar → verifikasi → onboarding chat → COA → dasbor", async ({ page }) => {
  const email = `onboard-${Date.now()}@tes.id`;
  await signupAndVerify(page, "Budi E2E", email);
  await expect(page.getByText("Kenalan dengan Nara")).toBeVisible();
  await walkOnboardingToDashboard(page);
});

test("rute app terkunci sebelum onboarding selesai", async ({ page }) => {
  const email = `locked-${Date.now()}@tes.id`;
  await signupAndVerify(page, "Kunci E2E", email);
  await page.goto("/dasbor");
  await expect(page).toHaveURL(/\/onboarding/);
  await page.goto("/jurnal");
  await expect(page).toHaveURL(/\/onboarding/);
});

test("verifikasi wajib sebelum onboarding", async ({ page }) => {
  await page.goto("/daftar");
  await page.getByLabel("Nama lengkap").fill("Belum Verif");
  await page.getByLabel("Email").fill(`unverified-${Date.now()}@tes.id`);
  await page.getByLabel("Kata Sandi").fill("rahasia12345");
  await page.getByRole("button", { name: "Daftar" }).click();
  await expect(page).toHaveURL(/\/verifikasi/, { timeout: 30000 });
  await expect(page.getByText("Periksa email Anda")).toBeVisible();
  // Tanpa verifikasi tidak ada sesi → /onboarding memantul ke /masuk.
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/masuk/);
});
