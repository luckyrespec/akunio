import { test, expect } from "@playwright/test";

const unique = () => `e2e-ai-${Date.now()}@test.id`;

async function signup(page: import("@playwright/test").Page) {
  await page.goto("/daftar");
  await page.getByLabel("Nama Organisasi").fill("Koperasi AI E2E");
  await page.getByLabel("Email").fill(unique());
  await page.getByLabel("Kata Sandi").fill("rahasia12345");
  await page.getByRole("button", { name: "Daftar" }).click();
  await expect(page).toHaveURL(/\/dasbor/);
}

test("composer creates draft, review posts it", async ({ page }) => {
  await signup(page);
  await page.goto("/jurnal/ai");
  await page.getByLabel("Deskripsi transaksi").fill("beli perlengkapan kantor tunai Rp 500.000");
  await page.getByRole("button", { name: "Buat Draft" }).click();
  await expect(page).toHaveURL(/\/jurnal\/ai\/[0-9a-f-]{36}$/);

  await expect(page.getByText("Apa yang dibaca asisten")).toBeVisible();
  await page.getByRole("button", { name: "Posting" }).click();
  await expect(page).toHaveURL(/\/jurnal\?tab=draft/);
  await expect(page.getByText("Diposting")).toBeVisible();
});

test("sidebar shows Asisten AI enabled", async ({ page }) => {
  await signup(page);
  await page.goto("/dasbor");
  await page.getByRole("link", { name: "Asisten AI" }).click();
  await expect(page).toHaveURL(/\/jurnal\/ai/);
  await expect(page.getByText("Asisten siap membantu")).toBeVisible();
});
