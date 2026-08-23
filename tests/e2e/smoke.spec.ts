import { test, expect } from "@playwright/test";

const unique = () => `e2e-${Date.now()}@test.id`;

test("signup lands in guarded app shell", async ({ page }) => {
  await page.goto("/daftar");
  await page.getByLabel("Nama Organisasi").fill("Koperasi E2E");
  await page.getByLabel("Email").fill(unique());
  await page.getByLabel("Kata Sandi").fill("rahasia12345");
  await page.getByRole("button", { name: "Daftar" }).click();
  await expect(page).toHaveURL(/\/dasbor/);
  await expect(page.getByText("Jurnal Umum")).toBeVisible();
});

test("unauthenticated access redirects to masuk", async ({ page }) => {
  await page.goto("/jurnal");
  await expect(page).toHaveURL(/\/masuk/);
});

test("statements render after direct visit", async ({ page }) => {
  // fresh signup for isolation
  const email = unique();
  await page.goto("/daftar");
  await page.getByLabel("Nama Organisasi").fill("Koperasi E2E Dua");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Kata Sandi").fill("rahasia12345");
  await page.getByRole("button", { name: "Daftar" }).click();
  await expect(page).toHaveURL(/\/dasbor/);

  await page.goto("/laporan/neraca");
  await expect(page.getByRole("heading", { name: "Neraca" })).toBeVisible();
  await expect(page.getByText("Laba Tahun Berjalan")).toBeVisible();
  await expect(page.getByText("Total Aset")).toBeVisible();

  await page.goto("/laporan/laba-rugi");
  await expect(page.getByText("Laba Bersih")).toBeVisible();
});
