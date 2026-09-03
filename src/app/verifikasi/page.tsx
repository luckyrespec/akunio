"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/server/auth/auth-client";
import { BackgroundBeams } from "@/components/aceternity/background-beams";
import { GlowCard } from "@/components/aceternity/glow-card";
import { Spotlight } from "@/components/aceternity/spotlight";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";

function VerifikasiContent() {
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
            <CardTitle className="font-display text-2xl">Periksa email Anda</CardTitle>
            <CardDescription>
              {email ? (
                <>Kami mengirim tautan verifikasi ke <span className="font-medium text-ink">{email}</span>. Klik tautan itu (berlaku 1 jam), lalu Anda akan diarahkan untuk kenalan dengan Nara.</>
              ) : (
                <>Klik tautan verifikasi di email Anda (berlaku 1 jam), lalu masuk kembali.</>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {sent && (
              <p className="text-sm text-emerald-600">Email terkirim ulang — periksa kotak masuk (dan spam) Anda.</p>
            )}
            {error && <p className="text-sm text-credit">{error}</p>}
            <Button
              type="button"
              disabled={busy || !email}
              onClick={onResend}
              className="w-full bg-terra hover:bg-terra/90"
            >
              {busy ? "Mengirim..." : "Kirim ulang email verifikasi"}
            </Button>
            <p className="text-center text-sm text-ink-soft">
              Sudah verifikasi? <Link className="text-terra underline" href="/masuk">Masuk</Link>
            </p>
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
