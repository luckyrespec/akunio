"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/server/auth/auth-client";
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

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email"));
    const password = String(fd.get("password"));

    const res =
      mode === "daftar"
        ? await authClient.signUp.email({
            email,
            password,
            name: String(fd.get("name")),
          })
        : await authClient.signIn.email({ email, password });

    setBusy(false);
    if (res.error) {
      setError(
        mode === "daftar"
          ? "Pendaftaran gagal — periksa kembali data Anda."
          : "Email atau kata sandi salah.",
      );
      return;
    }
    router.push("/dasbor");
  }

  return (
    <Card className="mx-auto mt-24 w-[380px] border-rule shadow-none">
      <CardHeader>
        <CardTitle className="font-display text-2xl">
          {mode === "daftar" ? "Mulai Pembukuan Anda" : "Masuk"}
        </CardTitle>
        <CardDescription>
          {mode === "daftar"
            ? "Organisasi, bagan akun, dan periode dibuat otomatis."
            : "Lanjutkan mengelola pembukuan Anda."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          {mode === "daftar" && (
            <div className="space-y-2">
              <Label htmlFor="name">Nama Organisasi</Label>
              <Input id="name" name="name" required placeholder="Koperasi Maju" />
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
  );
}
