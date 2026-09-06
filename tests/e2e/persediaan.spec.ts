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

test("tambah barang dengan Generate SKU", async ({ page }) => {
  const email = `sed${Date.now()}@test.id`;
  await signupAndVerify(page, "Gudang", email);
  await walkOnboardingToDashboard(page);
  await page.goto("/persediaan/daftar/baru");
  await page.waitForLoadState("networkidle", { timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.getByTestId("persediaan-nama").fill("Kertas HVS A4 E2E");
  await page.getByTestId("persediaan-generate-sku").click();
  await expect(page.getByTestId("persediaan-code")).toHaveValue(/BRG-/, { timeout: 10000 });
  await page.getByTestId("persediaan-simpan").click();
  await page.waitForLoadState("networkidle", { timeout: 30000 });
  await expect(page).toHaveURL(/\/persediaan\/daftar/, { timeout: 15000 });
  await expect(page.getByText("Kertas HVS A4 E2E").first()).toBeVisible();
});

test("batch bisa sembunyikan kolom opsional", async ({ page }) => {
  const email = `sed${Date.now()}@test.id`;
  await signupAndVerify(page, "Gudang", email);
  await walkOnboardingToDashboard(page);
  await page.goto("/persediaan/daftar/baru/batch");
  await page.waitForLoadState("networkidle", { timeout: 30000 });
  await page.waitForTimeout(2000);
  await expect(page.getByRole("columnheader", { name: /Kategori/ })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: /Barcode Pabrik/ })).toBeVisible();
  await page.getByTestId("batch-kolom-toggle").click();
  await page.getByRole("menuitemcheckbox", { name: "Kategori" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("columnheader", { name: /Kategori/ })).toBeHidden();
  await expect(page.getByRole("columnheader", { name: /Barcode Pabrik/ })).toBeVisible();
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
