"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Pressable, Stagger, StaggerItem } from "@/components/motion";
import { authClient } from "@/server/auth/auth-client";
import { GlowCard } from "@/components/aceternity/glow-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";

// Logo "G" Google empat warna (brand asset resmi) untuk tombol sosial.
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z"
      />
    </svg>
  );
}

export function AuthForm({ mode }: { mode: "masuk" | "daftar" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();
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
        setError("Masuk dengan Google gagal. Coba lagi.");
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
        // Completed users pass the onboarding gate straight to /dashboard.
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
      // Completed users pass the onboarding gate straight to /dashboard.
      window.location.href = "/onboarding";
    } catch (err: any) {
      setBusy(false);
      setError(err?.message || "Terjadi kesalahan jaringan. Silakan coba lagi.");
    }
  }

  return (
    <GlowCard intensity="medium" className="w-full">
      <Card className="rounded-2xl border-0 bg-transparent shadow-none">
        <CardHeader>
          <CardTitle className="font-display text-2xl">
            {mode === "daftar" ? "Mulai pembukuan rapi hari ini" : "Masuk ke Akunio"}
          </CardTitle>
          <CardDescription>
            {mode === "daftar"
              ? "Daftar, verifikasi email, lalu ceritakan usaha Anda — Akunio menyiapkan bagan akunnya."
              : "Masuk untuk melanjutkan pembukuan usaha Anda."}
          </CardDescription>
        </CardHeader>
        <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <Stagger className="space-y-4" staggerDelay={0.06}>
                {mode === "daftar" && (
                  <StaggerItem className="space-y-2">
                    <Label htmlFor="name">Nama lengkap</Label>
                    <Input id="name" name="name" required placeholder="Budi Santoso" />
                  </StaggerItem>
                )}
                <StaggerItem className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" required />
                </StaggerItem>
                <StaggerItem className="space-y-2">
                  <Label htmlFor="password">Kata Sandi</Label>
                  <Input id="password" name="password" type="password" minLength={8} required aria-describedby={mode === "daftar" ? "password-hint" : undefined} />
                  {mode === "daftar" && (
                    <p id="password-hint" className="text-xs text-ink-soft">
                      Minimal 8 karakter.
                    </p>
                  )}
                </StaggerItem>
                {reduceMotion ? (
                  error && (
                    <p role="alert" className="text-sm text-credit">
                      {error}
                    </p>
                  )
                ) : (
                  <AnimatePresence initial={false}>
                    {error && (
                      <motion.p
                        role="alert"
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                        className="text-sm text-credit"
                      >
                        {error}
                      </motion.p>
                    )}
                  </AnimatePresence>
                )}
                <StaggerItem>
                  <Pressable>
                    <Button type="submit" disabled={busy} className="w-full bg-terra hover:bg-terra/90">
                      {busy ? (mode === "daftar" ? "Mendaftarkan..." : "Masuk...") : mode === "daftar" ? "Daftar" : "Masuk"}
                    </Button>
                  </Pressable>
                </StaggerItem>
                {mode === "daftar" && (
                  <StaggerItem>
                    <p className="text-center text-xs leading-relaxed text-ink-soft">
                      Dengan mendaftar, Anda menyetujui Ketentuan Layanan dan
                      Kebijakan Privasi Akunio.
                    </p>
                  </StaggerItem>
                )}
                {googleEnabled && (
                  <StaggerItem className="space-y-4">
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
                      <GoogleIcon className="size-4 shrink-0" />
                      Lanjut dengan Google
                    </Button>
                  </StaggerItem>
                )}
              </Stagger>
              <p className="text-center text-sm text-ink-soft">
                {mode === "daftar" ? (
                  <>Sudah punya akun? <Link className="text-terra underline underline-offset-4" href="/masuk">Masuk</Link></>
                ) : (
                  <>Belum punya akun? <Link className="text-terra underline underline-offset-4" href="/daftar">Daftar</Link></>
                )}
              </p>
            </form>
        </CardContent>
      </Card>
    </GlowCard>
  );
}
