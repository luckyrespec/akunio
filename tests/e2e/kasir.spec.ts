import { test, expect } from "@playwright/test";
import { signupAndVerify, walkOnboardingToDashboard } from "./helpers";

test("kasir: tambah barang lalu checkout tunai sampai struk", async ({ page }) => {
  test.setTimeout(180_000);
  const email = `kasir${Date.now()}@test.id`;
  await signupAndVerify(page, "Kasir", email);
  await walkOnboardingToDashboard(page);

  await page.goto("/persediaan/daftar/baru");
  await page.waitForLoadState("networkidle", { timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.getByTestId("persediaan-nama").fill("Indomie E2E");
  await page.getByTestId("persediaan-generate-sku").click();
  await expect(page.getByTestId("persediaan-code")).toHaveValue(/BRG-/, { timeout: 10000 });
  await page.getByLabel("Stok Fisik Awal").fill("10");
  await page.getByLabel("Harga Beli / Modal (Rp)").fill("3000");
  await page.getByLabel("Harga Jual Standar (Rp)").fill("5000");
  await page.getByTestId("persediaan-simpan").click();
  await expect(page).toHaveURL(/\/persediaan\/daftar/, { timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 30000 });
  await page.waitForTimeout(2000);
  await expect(page.getByText("Indomie E2E").first()).toBeVisible({ timeout: 15000 });

  await page.goto("/kasir");
  await page.waitForLoadState("networkidle", { timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.getByTestId("kasir-search").fill("Indomie");
  const itemBtn = page.locator('[data-testid^="kasir-item-"]').first();
  await expect(itemBtn).toBeVisible({ timeout: 10000 });
  await itemBtn.click();
  await itemBtn.click();
  await expect(page.locator('[data-testid^="kasir-cart-row-"]').first()).toBeVisible({ timeout: 5000 });
  await page.getByTestId("kasir-cash-received").fill("15000");
  await page.getByTestId("kasir-submit").click();
  try {
    await expect(page).toHaveURL(/\/kasir\/struk\/[0-9a-f-]{36}/, { timeout: 60000 });
  } catch {
    const msg = await page.getByTestId("kasir-error").textContent({ timeout: 3000 }).catch(() => "(tanpa pesan error)");
    console.log(`KASIR-ERROR: ${msg}`);
    throw new Error(`checkout tidak navigasi. kasir-error: ${msg}`);
  }
  await expect(page.getByTestId("kasir-receipt").getByText("POS-", { exact: false }).first()).toBeVisible();
  await expect(page.getByTestId("kasir-receipt").getByText("Rp10.000").first()).toBeVisible();
});

test("setoran: buka shift lalu tutup pas tanpa selisih", async ({ page }) => {
  test.setTimeout(180_000);
  const email = `setor${Date.now()}@test.id`;
  await signupAndVerify(page, "Kasir", email);
  await walkOnboardingToDashboard(page);

  await page.goto("/kas-bank/setoran");
  await page.waitForLoadState("networkidle", { timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.getByTestId("setoran-opening").fill("100000");
  await page.getByTestId("setoran-open-submit").click();
  const shiftCard = page.locator('[data-testid^="setoran-shift-"]').first();
  await expect(shiftCard).toBeVisible({ timeout: 15000 });
  await expect(shiftCard.getByText("Rp100.000").first()).toBeVisible({ timeout: 15000 });
  await page.getByTestId("setoran-counted").fill("100000");
  await page.getByTestId("setoran-close-submit").click();
  await expect(page.getByText("ditutup pas", { exact: false }).first()).toBeVisible({ timeout: 15000 });
});
