import type { FullConfig } from "@playwright/test";

/**
 * Warm up the Turbopack dev server before tests.
 *
 * Background: `bun run dev` compiles routes on demand. A document requested
 * mid-compile can arrive WITHOUT the dev bootstrap script
 * (hmr-client_ts_*.js) — such a page renders but never hydrates, with zero
 * console/network errors. That silently breaks every interaction
 * (observed on /onboarding, which compiles ~4 brand-new client modules on
 * its first authenticated render).
 *
 * Production (`next start`, precompiled) is immune; this is purely a
 * dev-server race. Warming each route until its HTML contains the complete
 * bootstrap closes the window before any test runs.
 */
const WARM_PATHS = ["/daftar", "/masuk", "/verifikasi", "/onboarding", "/dashboard", "/faktur/baru"];

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { redirect: "follow" });
  return res.text();
}

async function globalSetup(config: FullConfig): Promise<void> {
  const base = config.projects[0]?.use?.baseURL ?? "http://localhost:3000";
  for (const path of WARM_PATHS) {
    const url = `${base}${path}`;
    const deadline = Date.now() + 90_000;
    for (;;) {
      const html = await fetchHtml(url);
      // Complete dev document: HMR bootstrap script tag present (not just preload).
      if (html.includes("hmr-client_ts_") && html.includes("</script>")) break;
      if (Date.now() > deadline) {
        throw new Error(`global-setup: ${url} never served a complete document`);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

export default globalSetup;
