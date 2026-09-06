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
  await page.getByTestId("faktur-item-picker").first().click();
  await page.getByRole("option", { name: /Cuci Rambut/ }).click();
  await page.getByTestId("faktur-item-picker").nth(1).click();
  await page.getByRole("option", { name: /Shampo/ }).click();
  // qty melebihi stok -> warning muncul, simpan tetap bisa
  await expect(page.getByTestId("faktur-stok-warning")).toBeVisible();
});
