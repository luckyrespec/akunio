import { test, expect } from "@playwright/test";

test("tambah jasa via UI", async ({ page }) => {
  await page.goto("/persediaan/jasa");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("persediaan-jasa-tambah").click();
  await page.getByTestId("persediaan-jasa-nama").fill("Cuci Rambut");
  await page.getByTestId("persediaan-jasa-harga").fill("50000");
  await page.getByTestId("persediaan-jasa-simpan").click();
  await expect(page.getByTestId("persediaan-jasa-list")).toContainText("Cuci Rambut");
});

test("faktur campur jasa + barang dengan warning stok", async ({ page }) => {
  await page.goto("/faktur/baru");
  await page.waitForLoadState("networkidle");
  // baris 1: ketik nama jasa persis -> harga terisi otomatis
  await page.getByTestId("faktur-item-picker").first().fill("Cuci Rambut");
  await expect(page.getByText("Jasa · tanpa stok").first()).toBeVisible();
  // baris 2: barang dengan qty melebihi stok -> warning muncul, simpan tetap bisa
  await page.getByRole("button", { name: /Tambah Baris/ }).click();
  await page.getByTestId("faktur-item-picker").nth(1).fill("Shampo");
  await page.getByLabel(/Kuantitas baris 2/).fill("999");
  await expect(page.getByTestId("faktur-stok-warning")).toBeVisible();
});
