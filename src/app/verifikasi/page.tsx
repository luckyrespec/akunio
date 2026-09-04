"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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

function VerifikasiContent() {
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email || code.trim().length < 4) {
      setError("Masukkan kode verifikasi dari email Anda.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Neon Auth memakai kode OTP numerik (kedaluwarsa 15 menit).
      // Auto-sign-in aktif, jadi sukses = sesi langsung ada.
      const res = await authClient.emailOtp.verifyEmail({
        email,
        otp: code.trim(),
      });
      setBusy(false);
      if (res.error) {
        setError(res.error.message || "Kode salah atau kedaluwarsa — coba kirim ulang.");
        return;
      }
      // Use hard navigation so the fresh session reaches Server Components.
      window.location.href = "/onboarding";
    } catch {
      setBusy(false);
      setError("Terjadi kesalahan jaringan. Silakan coba lagi.");
    }
  }

  async function onResend() {
    if (!email) {
      setError("Kembali ke halaman daftar dan gunakan email yang valid.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await authClient.sendVerificationEmail({
        email,
        callbackURL: "/onboarding",
      });
      setBusy(false);
      if (res.error) {
        setError(res.error.message || "Gagal mengirim ulang — coba lagi sebentar.");
        return;
      }
      setSent(true);
    } catch {
      setBusy(false);
      setError("Terjadi kesalahan jaringan. Silakan coba lagi.");
    }
  }

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden px-(--gutter)">
      <BackgroundBeams />
      <Spotlight className="-top-32" />
      <GlowCard intensity="medium" className="relative z-10 w-full max-w-md">
        <Card className="rounded-2xl border-0 bg-transparent shadow-none">
          <CardHeader>
            <CardTitle className="font-display text-2xl">Masukkan kode verifikasi</CardTitle>
            <CardDescription>
              {email ? (
                <>Kami mengirim kode 6 digit ke <span className="font-medium text-ink">{email}</span>. Kode berlaku 15 menit.</>
              ) : (
                <>Masukkan kode 6 digit dari email verifikasi Anda (berlaku 15 menit).</>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onVerify} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="otp">Kode verifikasi</Label>
                <Input
                  id="otp"
                  data-testid="otp-input"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  className="text-center text-lg tracking-[0.3em]"
                />
              </div>
              {error && <p className="text-sm text-credit">{error}</p>}
              <Button
                type="submit"
                data-testid="otp-verify"
                disabled={busy || code.trim().length < 4}
                className="w-full bg-terra hover:bg-terra/90"
              >
                {busy ? "Memverifikasi..." : "Verifikasi & Lanjut"}
              </Button>
            </form>
            <div className="mt-4 space-y-4">
              {sent && (
                <p className="text-sm text-emerald-600">Kode baru terkirim — periksa kotak masuk (dan spam) Anda.</p>
              )}
              <Button
                type="button"
                variant="outline"
                disabled={busy || !email}
                onClick={onResend}
                className="w-full border-rule bg-paper"
              >
                Kirim ulang kode
              </Button>
              <p className="text-center text-sm text-ink-soft">
                Sudah verifikasi? <Link className="text-terra underline" href="/masuk">Masuk</Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </GlowCard>
    </div>
  );
}

export default function VerifikasiPage() {
  return (
    <Suspense>
      <VerifikasiContent />
    </Suspense>
  );
}
