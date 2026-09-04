import { createNeonAuth } from "@neondatabase/auth/next/server";

function requiredSecret(): string {
  const s = process.env.NEON_AUTH_COOKIE_SECRET;
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("NEON_AUTH_COOKIE_SECRET wajib diisi (min 32 karakter) di production.");
    }
    return "neraca-dev-cookie-secret-only-32-chars!";
  }
  return s;
}

function baseUrl(): string {
  const u = process.env.NEON_AUTH_BASE_URL;
  if (!u && process.env.NODE_ENV === "production") {
    throw new Error("NEON_AUTH_BASE_URL wajib diisi di production.");
  }
  return u || "http://localhost:3000/api/auth";
}

// Managed Better Auth (Neon Auth). Session/pengguna/kebijakan auth
// (termasuk rate limit & verifikasi email) hidup di sisi Neon — di sini
// hanya ada instance tipis + cache sesi bertanda tangan.
// Lihat session.ts untuk pemetaan sesi Neon → AppContext (org/role lokal).
export const auth = createNeonAuth({
  baseUrl: baseUrl(),
  cookies: {
    secret: requiredSecret(),
    // TTL pendek agar gate onboarding tidak lama bertindak atas flag
    // emailVerified yang basi setelah verifikasi OTP.
    sessionDataTtl: 60,
  },
});
