"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/server/auth/auth-client";
import { BackgroundBeams } from "@/components/aceternity/background-beams";
import { GlowCard } from "@/components/aceternity/glow-card";
import { Spotlight } from "@/components/aceternity/spotlight";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";

export function AuthForm({ mode }: { mode: "masuk" | "daftar" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_ENABLED === "1";

  function verificationUrl(email: string): string {
    return `/verifikasi?email=${encodeURIComponent(email)}`;
  }

  async function onGoogle() {
    setBusy(true);
    setError(null);
    try {
      const res = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/onboarding",
      });
      setBusy(false);
      if (res.error) {
        setError("Login Google gagal — coba lagi sebentar.");
        return;
      }
      if (res.data?.url) window.location.href = res.data.url;
    } catch {
      setBusy(false);
      setError("Terjadi kesalahan jaringan. Silakan coba lagi.");
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email")).trim();
    const password = String(fd.get("password"));

    try {
      if (mode === "daftar") {
        const res = await authClient.signUp.email({
          email,
          password,
          name: String(fd.get("name") || "Pengguna Baru").trim(),
        });
        setBusy(false);
        if (res.error) {
          setError(
            res.error.message ||
              "Pendaftaran gagal — periksa kembali data Anda atau coba email lain."
          );
          return;
        }
        // Neon Auth: jangan menebak status verifikasi dari bentuk respons
        // (berbeda saat require on/off) — cek sesi yang sebenarnya ada.
        // Ada sesi → /onboarding (gate menolak yang tak bersesi).
        // Tanpa sesi → /verifikasi (kasus require_email_verification).
        const { data: sess } = await authClient.getSession();
        // Use hard navigation to ensure session cookies are fully sent to Server Components.
        // Completed users pass the onboarding gate straight to /dasbor.
        window.location.href = sess?.session ? "/onboarding" : verificationUrl(email);
        return;
      }

      const res = await authClient.signIn.email({ email, password });
      setBusy(false);
      if (res.error) {
        const code = (res.error as { code?: string }).code ?? "";
        const msg = res.error.message ?? "";
        if (code === "EMAIL_NOT_VERIFIED" || /verif/i.test(code + msg)) {
          window.location.href = verificationUrl(email);
          return;
        }
        setError(msg || "Email atau kata sandi salah. Silakan periksa kembali.");
        return;
      }
      // Use hard navigation to ensure session cookies are fully sent to Server Components.
      // Completed users pass the onboarding gate straight to /dasbor.
      window.location.href = "/onboarding";
    } catch (err: any) {
      setBusy(false);
      setError(err?.message || "Terjadi kesalahan jaringan. Silakan coba lagi.");
    }
  }

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden px-(--gutter)">
      <BackgroundBeams />
      <Spotlight className="-top-32" />
      <GlowCard intensity="medium" className="relative z-10 w-full max-w-md">
        <Card className="rounded-2xl border-0 bg-transparent shadow-none">
          <CardHeader>
            <CardTitle className="font-display text-2xl">
              {mode === "daftar" ? "Mulai Pembukuan Anda" : "Masuk"}
            </CardTitle>
            <CardDescription>
              {mode === "daftar"
                ? "Verifikasi email, lalu kenalan dengan Nara untuk menyiapkan pembukuan usaha Anda."
                : "Lanjutkan mengelola pembukuan Anda."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              {mode === "daftar" && (
                <div className="space-y-2">
                  <Label htmlFor="name">Nama lengkap</Label>
                  <Input id="name" name="name" required placeholder="Budi Santoso" />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Kata Sandi</Label>
                <Input id="password" name="password" type="password" minLength={8} required />
              </div>
              {error && <p className="text-sm text-credit">{error}</p>}
              <Button type="submit" disabled={busy} className="w-full bg-terra hover:bg-terra/90">
                {busy ? "Memproses..." : mode === "daftar" ? "Daftar" : "Masuk"}
              </Button>
              {googleEnabled && (
                <>
                  <div className="flex items-center gap-3 text-xs text-ink-soft">
                    <span className="h-px flex-1 bg-rule" />
                    atau
                    <span className="h-px flex-1 bg-rule" />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={onGoogle}
                    className="w-full border-rule bg-paper"
                  >
                    Lanjut dengan Google
                  </Button>
                </>
              )}
              <p className="text-center text-sm text-ink-soft">
                {mode === "daftar" ? (
                  <>Sudah punya akun? <Link className="text-terra underline" href="/masuk">Masuk</Link></>
                ) : (
                  <>Belum punya akun? <Link className="text-terra underline" href="/daftar">Daftar</Link></>
                )}
              </p>
            </form>
          </CardContent>
        </Card>
      </GlowCard>
    </div>
  );
}
