import { test, expect } from "@playwright/test";
import { signupAndVerify, walkOnboardingToDashboard } from "./helpers";

test("daftar → onboarding chat → COA → dasbor", async ({ page }) => {
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

test("halaman verifikasi menampilkan form OTP", async ({ page }) => {
  // Branch e2e mematikan require_email_verification, jadi alur OTP tidak
  // bisa diselesaikan di sini — yang diuji: halaman me-render form kode
  // dan tombol kirim ulang. Verifikasi OTP end-to-end dilakukan manual
  // sekali setelah flag dinyalakan di branch main.
  await page.goto("/verifikasi?email=otp%40tes.id");
  await expect(page.getByText("Masukkan kode verifikasi")).toBeVisible();
  await page.getByTestId("otp-input").fill("123456");
  await expect(page.getByTestId("otp-verify")).toBeEnabled();
  // Tanpa sesi → /onboarding memantul ke /masuk.
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/masuk/);
});
