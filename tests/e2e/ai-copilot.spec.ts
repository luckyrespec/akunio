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

test("Nara creates draft via chat, review posts it", async ({ page }) => {
  await signup(page);
  await page.goto("/asisten");
  // Nara chat input
  const input = page.getByPlaceholder(/Tanya Nara|Tanya/);
  await input.fill("buatkan jurnal beli perlengkapan kantor tunai Rp 500.000");
  await page.getByRole("button", { name: "Kirim" }).click();
  // Wait for draft card
  await expect(page.getByText("Draft Jurnal")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Lihat & Posting Draft" }).click();
  await expect(page).toHaveURL(/\/jurnal\/ai\/[0-9a-f-]{36}$/);

  await expect(page.getByText("Apa yang dibaca asisten")).toBeVisible();
  await page.getByRole("button", { name: "Posting" }).click();
  await expect(page).toHaveURL(/\/jurnal\?tab=draft/);
  await expect(page.getByText("Diposting")).toBeVisible();
});

test("sidebar shows Nara enabled and /jurnal/ai redirects", async ({ page }) => {
  await signup(page);
  await page.goto("/dasbor");
  await page.getByRole("link", { name: "Nara" }).click();
  await expect(page).toHaveURL(/\/asisten/);
  await expect(page.getByText("Nara", { exact: false })).toBeVisible();
  await page.goto("/jurnal/ai");
  await expect(page).toHaveURL(/\/asisten/);
});
