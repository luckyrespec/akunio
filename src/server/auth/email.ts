// better-auth 1.7.1 findings (verified against node_modules/better-auth/dist):
// (a) signUp.email resolves { data: { token: string | null, user }, error } —
//     with requireEmailVerification the user is created but token is null
//     (no session) until the email is verified (api/routes/sign-up.d.mts).
// (b) OAuth available via signIn.social({ provider: "google", callbackURL });
//     OAuth account inserts always carry a computed issuer
//     (oauth2/account-key.mjs) so the NOT NULL account.issuer column is safe.
// (c) client exposes sendVerificationEmail({ email, callbackURL })
//     (POST /send-verification-email); verification link is
//     GET /verify-email?token=...&callbackURL=...

interface EmailUser {
  email: string;
  name?: string | null;
}

export async function sendAuthEmail(
  kind: "verification" | "reset-password",
  user: EmailUser,
  url: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY belum dikonfigurasi untuk pengiriman email.");
    }
    console.log(`[auth:${kind}] kirim ke ${user.email}: ${url}`);
    return;
  }
  const subject =
    kind === "verification" ? "Verifikasi email Neraca Anda" : "Reset kata sandi Neraca";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "Neraca <noreply@neraca.id>",
      to: user.email,
      subject,
      html: `<p>Halo${user.name ? ` ${user.name}` : ""},</p><p>Klik tautan berikut:</p><p><a href="${url}">${url}</a></p><p>Tautan kedaluwarsa dalam 1 jam.</p>`,
    }),
  });
  if (!res.ok) throw new Error("Gagal mengirim email — coba lagi sebentar.");
}
