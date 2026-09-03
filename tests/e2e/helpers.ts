import { expect, type Page } from "@playwright/test";

/** Daftar → /verifikasi → tandai verified via seam → masuk → /onboarding. */
export async function signupAndVerify(
  page: Page,
  name: string,
  email: string,
  password = "rahasia12345",
) {
  await page.goto("/daftar");
  await page.getByLabel("Nama lengkap").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Kata Sandi").fill(password);
  await page.getByRole("button", { name: "Daftar" }).click();
  // Generous: cold dev server + bcrypt + parallel workers can take a while.
  await expect(page).toHaveURL(/\/verifikasi/, { timeout: 30000 });

  const res = await page.request.post("/api/test/verify", { data: { email } });
  expect(res.ok()).toBe(true);

  await page.goto("/masuk");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Kata Sandi").fill(password);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 30000 });
}

/** Walk the 7 onboarding steps via input + chips, confirm COA, land on /dasbor. */
export async function walkOnboardingToDashboard(
  page: Page,
  opts?: { displayName?: string; businessName?: string },
) {
  await ensureOnboardingHydrated(page);
  const send = async (text: string) => {
    const input = page.getByTestId("onboarding-input");
    await input.click();
    // Real keystrokes (not fill): the controlled PromptInputTextarea only
    // commits React state on trusted input events.
    await input.pressSequentially(text, { delay: 10 });
    // Bisect aid: fail fast here (not on the send click) if keystrokes
    // never landed in the DOM — distinguishes focus/load issues from
    // React-state issues.
    await expect(input).toHaveValue(text, { timeout: 10000 });
    await page.getByTestId("onboarding-send").click();
  };
  const chip = (name: string) =>
    page.getByTestId("onboarding-chip").filter({ hasText: name }).click();

  await send(opts?.displayName ?? "Budi");
  await send(opts?.businessName ?? "Warung Budi E2E");
  await chip("Kuliner");
  await chip("10–50");
  await chip("2–5");
  await chip("Lewati");
  await chip("Teman");
  await chip("Ya, lanjut");
  await expect(page.getByTestId("coa-confirm")).toBeVisible();
  await page.getByTestId("coa-confirm").click();
  await expect(page).toHaveURL(/\/dasbor/, { timeout: 30000 });
}

/**
 * Wait for /onboarding hydration, then verify interactivity.
 *
 * Two dev-server hazards are handled:
 * 1. Pre-hydration typing: keystrokes typed before hydration commits are
 *    wiped when React takes over the controlled input. Solved by waiting
 *    for the `data-onboarding-ready` marker (set in a mount effect, which
 *    only runs post-hydration) before typing anything.
 * 2. Mid-compile documents: a page requested while Turbopack is compiling
 *    can arrive without its bootstrap script and never hydrate (renders
 *    fine, zero errors, all interaction dead). Solved by a bounded
 *    reload-and-reprobe loop. See tests/e2e/global-setup.ts.
 */
async function ensureOnboardingHydrated(page: Page): Promise<void> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await page.waitForSelector('body[data-onboarding-ready="1"]', { timeout: 30000 });
      const input = page.getByTestId("onboarding-input");
      await input.click();
      await input.pressSequentially("x", { delay: 5 });
      await expect(page.getByTestId("onboarding-send")).toBeEnabled({ timeout: 10000 });
      await input.clear();
      return;
    } catch {
      if (attempt === 2) throw new Error("onboarding tidak terhidrasi setelah 2x reload");
      await page.reload();
    }
  }
}
