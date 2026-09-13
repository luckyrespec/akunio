import { test, expect, type Page } from "@playwright/test";
import { signupAndVerify, walkOnboardingToDashboard } from "./helpers";

async function signupToDashboard(page: Page, tag: string) {
  const email = `jasa${tag}${Date.now()}@test.id`;
  await signupAndVerify(page, "Jasa", email);
  await walkOnboardingToDashboard(page);
}

/** Gerbang hidrasi halaman faktur: klik harus menambah baris. Maks 1x reload
 *  bila dokumen datang tanpa bootstrap (hazard dev-server, lihat global-setup). */
async function ensureFakturHydrated(page: Page) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await page.getByRole("button", { name: /Tambah Baris/ }).click({ timeout: 10000 });
      await expect(page.getByTestId("faktur-item-picker")).toHaveCount(2, { timeout: 10000 });
      return;
    } catch {
      if (attempt === 2) throw new Error("faktur tidak terhidrasi setelah 2x reload");
      await page.reload();
      await page.waitForLoadState("networkidle", { timeout: 30000 });
      await page.waitForTimeout(2000);
    }
  }
}

test("tambah jasa via UI gabungan + route lama redirect", async ({ page }) => {
  test.setTimeout(180_000);
  await signupToDashboard(page, "a");

  await page.goto("/persediaan/daftar?jenis=jasa");
  await page.waitForLoadState("networkidle", { timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.getByTestId("persediaan-jasa-tambah").click();
  await page.getByTestId("persediaan-jasa-nama").fill("Cuci Rambut");
  await page.getByTestId("persediaan-jasa-harga").fill("50000");
  await page.getByTestId("persediaan-jasa-simpan").click();
  await expect(page).toHaveURL(/\/persediaan\/daftar\?jenis=jasa/, { timeout: 30000 });
  // Jasa tampil sebagai baris tabel gabungan dengan badge Jasa.
  const row = page.getByRole("row", { name: /Cuci Rambut/ });
  await expect(row).toContainText("Cuci Rambut");
  await expect(row.getByText("Jasa", { exact: true })).toBeVisible();

  // Regresi: di tab Semua jasa tidak boleh dobel (barang + jasa).
  await page.goto("/persediaan/daftar?jenis=semua");
  await page.waitForLoadState("networkidle", { timeout: 30000 });
  await page.waitForTimeout(1500);
  await expect(page.getByRole("row", { name: /Cuci Rambut/ })).toHaveCount(1);

  // Route lama tidak lagi jadi halaman sendiri.
  await page.goto("/persediaan/jasa");
  await expect(page).toHaveURL(/\/persediaan\/daftar\?jenis=jasa/, { timeout: 30000 });
});

test("faktur campur jasa + barang dengan warning stok", async ({ page }) => {
  test.setTimeout(180_000);
  await signupToDashboard(page, "b");
  const stamp = Date.now().toString(36);
  const jasaName = `Cuci E2E ${stamp}`;
  const barangName = `Shampo E2E ${stamp}`;

  // Siapkan jasa.
  await page.goto("/persediaan/daftar?jenis=jasa");
  await page.waitForLoadState("networkidle", { timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.getByTestId("persediaan-jasa-tambah").click();
  await page.getByTestId("persediaan-jasa-nama").fill(jasaName);
  await page.getByTestId("persediaan-jasa-harga").fill("50000");
  await page.getByTestId("persediaan-jasa-simpan").click();
  await expect(page).toHaveURL(/\/persediaan\/daftar\?jenis=jasa/, { timeout: 30000 });

  // Siapkan barang dengan stok 10.
  await page.goto("/persediaan/daftar/baru");
  await page.waitForLoadState("networkidle", { timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.getByTestId("persediaan-nama").fill(barangName);
  await page.getByTestId("persediaan-generate-sku").click();
  await expect(page.getByTestId("persediaan-code")).toHaveValue(/BRG-/, { timeout: 10000 });
  await page.getByLabel("Stok Fisik Awal").fill("10");
  await page.getByLabel("Harga Beli / Modal (Rp)").fill("3000");
  await page.getByLabel("Harga Jual Standar (Rp)").fill("5000");
  await page.getByTestId("persediaan-simpan").click();
  await expect(page).toHaveURL(/\/persediaan\/daftar/, { timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 30000 });
  await page.waitForTimeout(2000);
  await expect(page.getByText(barangName).first()).toBeVisible({ timeout: 15000 });

  await page.goto("/faktur/baru");
  await page.waitForLoadState("networkidle", { timeout: 30000 });
  await page.waitForTimeout(2000);
  await ensureFakturHydrated(page);
  // baris 1: ketik nama jasa persis -> tertaut + harga terisi otomatis
  await page.getByTestId("faktur-item-picker").first().fill(jasaName);
  await expect(page.getByTestId("faktur-item-terikat").first()).toContainText("Jasa · tanpa stok");
  await expect(page.getByLabel("Harga satuan baris 1")).toHaveValue("50000");
  // baris 2: barang dengan qty melebihi stok -> warning muncul, simpan tetap bisa
  await page.getByTestId("faktur-item-picker").nth(1).fill(barangName);
  await page.getByLabel(/Kuantitas baris 2/).fill("999");
  await expect(page.getByTestId("faktur-stok-warning")).toBeVisible();
});
